import { format, isAfter, isBefore, parse } from 'date-fns'
import { Inputs } from './popup'
import { Command } from './util/commands'

export interface SearchResult {
  id: string
  name: string
  date: string | null // yyyy-MM-dd
}

interface TimeSelectionEntry {
  timeString: string // h:mma
  time: Date
  position: number
}

chrome.runtime.onMessage.addListener(
  async (request: any, sender: chrome.runtime.MessageSender, sendResponse: Function) => {
    console.info(`Received request: ${JSON.stringify(request)}`)
    let res
    try {
      switch (request.command) {
        case Command.GET_BOOKING_DATE:
          res = await getBookingDate()
          break

        case Command.PRESS_HOME_PAGE_CHANGE_BUTTON:
          res = await pressHomePageChangeButton()
          break

        case Command.ENTER_POSTCODE:
          res = await enterPostcode(request.inputs)
          break

        case Command.FIND_TEST_CENTRES:
          res = await findTestCentres()
          break

        case Command.SHOW_MORE_RESULTS:
          res = await showMoreResults()
          break

        case Command.OPEN_CALENDAR:
          res = await openCalendar(request.searchResult)
          break

        case Command.CHOOSE_CALENDAR_TIME:
          res = await chooseCalendarTime(request.inputs, request.searchResult)
          break

        default:
          console.error(`Unknown command: ${request.command}`)
      }
    } catch (err) {
      console.error(err)
      res = { err: `${err}` }
    }
    console.info(`Completed command: ${request.command}. Sent response from content script: ${JSON.stringify(res)}`)
    sendResponse(res ?? {})
  }
)

async function getBookingDate () {
  const title = document.querySelector('#header-title > h1')?.textContent
  if (title !== 'View booking') {
    throw new Error('Please navigate to view booking page first')
  }

  const bookingDateField = document.querySelector('#confirm-booking-details > section:nth-child(1) > div > dl > dd:nth-child(1)')
  const bookingDate = parse(bookingDateField?.textContent!!, 'EEEE d MMMM yyyy h:mma', 0)
  return { bookingDate }
}

// Step 0: Press "Change" button on home page
async function pressHomePageChangeButton () {
  checkHeaderTitle('View booking')
  document.getElementById('test-centre-change')?.click()
}

// Step 1a: Enter postcode
async function enterPostcode ({ postcode }: Inputs) {
  checkPageTitle('Test centre search and results')
  const testCentresInput = document.getElementById('test-centres-input') as HTMLInputElement
  testCentresInput.value = postcode
  document.getElementById('test-centres-submit')?.click()
}

// Step 1b: Parse search results
async function findTestCentres (): Promise<{searchResults: SearchResult[]}> {
  checkPageTitle('Test centre search and results')
  const testCentreDetails = Array.from(document.getElementsByClassName('test-centre-details'))
  const searchResults = testCentreDetails.map(detail => {
    const id = detail.closest('a')!!.getAttribute('id')!!
    const name = detail.getElementsByTagName('h4')[0].textContent!!
    const description = detail.getElementsByTagName('h5')[0].textContent!!

    let date: string | null
    if (description.includes('No tests found on any date')) {
      date = null
    } else if (description.includes('available tests around')) {
      const ddmmyyyy = description.match(/\d{2}\/\d{2}\/\d{4}/)!![0]
      date = formatDate(parse(ddmmyyyy, 'dd/MM/yyyy', 0))
    } else {
      throw new Error(`Date pattern not found in test centre description [${description}] for test centre [${name}]!`)
    }

    return { id, name, date }
  })
  return { searchResults }
}

// Step 1c: Show more results
async function showMoreResults () : Promise<void> {
  checkPageTitle('Test centre search and results')
  document.getElementById('fetch-more-centres')?.click()
}

// Step 2a: Open calendar
async function openCalendar (searchResult: SearchResult) {
  checkPageTitle('Test centre search and results')
  document.getElementById(searchResult.id)?.click()
}

// Step 2b: Choose calendar time
async function chooseCalendarTime (inputs: Inputs, searchResult: SearchResult) {
  const { startTime, endTime } = inputs
  const parsedStartTime = parse(startTime, 'hh:mm', 0)
  const parsedEndTime = parse(endTime, 'hh:mm', 0)

  checkPageTitle(`Test date / time${searchResult.name}`)

  const dateCell = document.querySelector(`a[data-date='${searchResult.date}'`) as HTMLElement
  dateCell.click()

  const timeEls = document.getElementById(`date-${searchResult.date}`)?.getElementsByClassName('SlotPicker-time')
  const acceptableEntries = Array.from(timeEls ?? [])
    .map((el, position) => <TimeSelectionEntry>{
      timeString: el.textContent!!,
      time: parse(el.textContent!!, 'h:mma', 0),
      position
    })
    .filter(entry =>
      !isBefore(entry.time, parsedStartTime) && !isAfter(entry.time, parsedEndTime))

  console.log(acceptableEntries)
}

function checkHeaderTitle (expectedTitle: String) {
  const title = document.querySelector('#header-title > h1')?.textContent
  if (title !== expectedTitle) {
    throw new Error(`Please navigate to "${expectedTitle}" page first`)
  }
}

function checkPageTitle (expectedTitle: String) {
  const title = document.querySelector('#main > div.page-header > h1')?.textContent
  if (title !== expectedTitle) {
    throw new Error(`Please navigate to "${expectedTitle}" page first`)
  }
}

function formatDate (d: Date): string {
  return format(d, 'yyyy-MM-dd')
}
