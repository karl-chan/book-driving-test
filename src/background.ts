import { isAfter, isBefore, parseISO } from 'date-fns'
import { SearchResult } from './contentScript'
import { Inputs } from './popup'
import { BackgroundCommand, Command } from './util/commands'
import { formatDate, parseDate } from './util/dates'
import { callContentScript } from './util/ipc'
import { setDifference } from './util/sets'

chrome.runtime.onMessage.addListener(
  (request, sender, sendResponse) => {
    handler(request, sender, sendResponse)

    // per:
    // http://developer.chrome.com/extensions/runtime.html#event-onMessage
    //
    // This function becomes invalid when the event listener returns,
    // unless you return true from the event listener to indicate you
    // wish to send a response asynchronously (this will keep the message
    // channel open to the other end until sendResponse (3rd arg) is called).
    return true
  }
)

async function handler (request: any, sender: chrome.runtime.MessageSender, sendResponse: Function) {
  console.info(`Received request: ${JSON.stringify(request)}`)
  let res
  try {
    switch (request.command) {
      case BackgroundCommand.START_AUTOBOOK:
        await autobook(request.inputs)
        break
      case BackgroundCommand.STOP_AUTOBOOK:
        await stopAutobook()
        break
      default:
        console.error(`Unknown command: ${request.command}`)
    }
  } catch (err) {
    console.error(err)
    res = { err: `${err}` }
  }
  console.info(`Completed command: ${request.command}. Sent response from background script: ${JSON.stringify(res)}`)
  sendResponse(res ?? {})
  return true
}

interface State {
  running: boolean
}
const state: State = { running: false }

async function autobook (inputs: Inputs) {
  state.running = true

  // Get current tab
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tabs.length) {
    throw new Error('Please reopen this extension from a tab')
  }
  const tabId = tabs[0].id!!

  // Step 0: Navigate to home page
  await chrome.tabs.update(tabId, { url: 'https://driverpracticaltest.dvsa.gov.uk/manage' })
  await simulateUserSleep()

  const { bookingDate } = await callContentScript(tabId, { command: Command.GET_BOOKING_DATE })
  const parsedBookingDate = parseISO(bookingDate)
  const { testCentres, startDate, endDate, allowLaterTestDates } = inputs
  const testCentreSet = new Set(testCentres)

  if (!allowLaterTestDates && isBefore(parsedBookingDate, parseDate(endDate))) {
    throw new Error(`Search end date ${endDate} must not be later than the current test date ${formatDate(parsedBookingDate)}!`)
  }

  // Step 1: Press "Change" button on home page
  await callContentScript(tabId, { command: Command.PRESS_HOME_PAGE_CHANGE_BUTTON })
  await simulateUserSleep()

  // Step 2: Change test centre
  let earliestResult
  while (!earliestResult && state.running) { // loop until found
    await callContentScript(tabId, { command: Command.ENTER_POSTCODE, inputs })
    await simulateUserSleep()

    while (state.running) {
      const { searchResults }: { searchResults: SearchResult[]} = await callContentScript(tabId, { command: Command.FIND_TEST_CENTRES })

      const resultsWithinRange = searchResults.filter(result => {
        if (!testCentreSet.has(result.name) || result.date === null) {
          return false
        }
        const parsedDate = parseDate(result.date)
        return !isBefore(parsedDate, parseDate(startDate)) && !isAfter(parsedDate, parseDate(endDate))
      })
      resultsWithinRange.sort((a, b) => parseDate(a.date!!).getTime() - parseDate(b.date!!).getTime())

      if (resultsWithinRange.length) {
        earliestResult = resultsWithinRange[0]
        break
      }

      const resultCentreSet = new Set(searchResults.map(result => result.name))
      const seenAllCentres = setDifference(testCentreSet, resultCentreSet).size === 0
      if (seenAllCentres) {
        break // back to beginning of step 2
      }

      await callContentScript(tabId, { command: Command.SHOW_MORE_RESULTS })
      await simulateUserSleep()
    }
  }

  // Step 3: Change test time
  await callContentScript(tabId, { command: Command.OPEN_CALENDAR, searchResult: earliestResult })
  await simulateUserSleep()
  await callContentScript(tabId, { command: Command.CHOOSE_CALENDAR_TIME, inputs, searchResult: earliestResult })
  await simulateUserSleep()

  console.log(earliestResult)
}

async function stopAutobook () {
  state.running = false
}

async function simulateUserSleep (minDelay: number = 1000): Promise<void> {
  await new Promise(resolve =>
    setTimeout(
      resolve,
      Math.random() * 250 + minDelay)
  )
}
