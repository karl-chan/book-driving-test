import { differenceInBusinessDays, isBefore, parse } from 'date-fns'
import { BackgroundCommand } from './util/commands'
import { TEST_CENTERS } from './util/constants'
import { parseDate } from './util/dates'
import { callBackgroundScript } from './util/ipc'

const INPUTS_STORAGE_KEY = 'inputs'

export interface Inputs {
  postcode: string
  testCentres: string[]
  startDate: string // yyyy-MM-dd
  endDate: string // yyyy-MM-dd
  startTime: string // hh:mm
  endTime: string // hh:mm
  allowLaterTestDates: boolean
}

let started = false
const startStopButton = document.getElementById('startStop')!!
const clearButton = document.getElementById('clear')!!

const postcodeField = document.getElementById('postcode')!! as HTMLInputElement
const testCentresField = document.getElementById('testCentres')!! as HTMLInputElement
const startDateField = document.getElementById('startDate')!! as HTMLInputElement
const endDateField = document.getElementById('endDate')!! as HTMLInputElement
const startTimeField = document.getElementById('startTime')!! as HTMLInputElement
const endTimeField = document.getElementById('endTime')!! as HTMLInputElement
const messageDiv = document.getElementById('message')!!
const allowLaterTestDatesCheckbox = document.getElementById('allowLaterTestDates')!! as HTMLInputElement

startStopButton.addEventListener('click', startStop)
clearButton.addEventListener('click', clear)

async function init () {
  restoreInputs()
}

async function startStop () {
  if (started) {
    await stop()
  } else {
    await start()
  }
}

async function start () {
  startStopButton.textContent = 'Stop'
  started = true
  clearMessage()
  try {
    const inputs = await validateAndSaveInputs()
    setSummaryMessage(inputs)

    await callBackgroundScript({ command: BackgroundCommand.START_AUTOBOOK, inputs })
  } catch (err) {
    console.error(err)
    setErrorMessage(err)
    await stop()
  }
}

async function stop () {
  startStopButton.textContent = 'Start'
  started = false

  await callBackgroundScript({ command: BackgroundCommand.STOP_AUTOBOOK })
}

async function clear () {
  clearMessage()
  await clearInputs()
}

async function validateAndSaveInputs (): Promise<Inputs> {
  const inputs = validateInputs()
  await saveInputs(inputs)
  return inputs
}

function validateInputs (): Inputs {
  const postcode = postcodeField.value
  if (!postcode) {
    throw new Error('Missing postcode!')
  }

  const testCentres = testCentresField.value
    .split(',')
    .map(v => v.trim())
    .filter(v => v) // omit empty strings

  if (!testCentres.length) {
    throw new Error('No test centers selected!')
  }
  for (const tc of testCentres) {
    if (!TEST_CENTERS.has(tc)) {
      throw new Error(`Test center does not exist: ${tc}!`)
    }
  }

  const startDate = startDateField.value
  if (!startDate) {
    throw new Error('Missing start date!')
  }
  const parsedStartDate = parseDate(startDate)
  const today = new Date()
  if (isBefore(parsedStartDate, today)) {
    throw new Error('Start date is before today!')
  }
  if (differenceInBusinessDays(parsedStartDate, today) < 3) {
    throw new Error('Start date is within non-refundable cancellation period!')
  }

  const endDate = endDateField.value
  if (!endDate) {
    throw new Error('Missing end date!')
  }
  const parsedEndDate = parseDate(endDate)
  if (isBefore(parsedEndDate, today)) {
    throw new Error('End date is before today!')
  }
  if (isBefore(parsedEndDate, parsedStartDate)) {
    throw new Error('End date is before start date!')
  }

  const startTime = startTimeField.value
  if (!startTime) {
    throw new Error('Missing start time!')
  }

  const endTime = endTimeField.value
  if (!endTime) {
    throw new Error('Missing end time!')
  }

  if (isBefore(parse(endTime, 'hh:mm', 0), parse(startTime, 'hh:mm', 0))) {
    throw new Error('End time is before start time!')
  }

  const allowLaterTestDates = allowLaterTestDatesCheckbox.checked

  return {
    postcode,
    testCentres,
    startDate,
    endDate,
    startTime,
    endTime,
    allowLaterTestDates
  }
}

async function saveInputs (inputs: Inputs) {
  return chrome.storage.local.set({ [INPUTS_STORAGE_KEY]: inputs })
}

async function restoreInputs () {
  const { inputs } = await chrome.storage.local.get([INPUTS_STORAGE_KEY])
  if (inputs) {
    const { postcode, testCentres, startDate, endDate, startTime, endTime, allowLaterTestDates } = inputs as Inputs

    postcodeField.value = postcode
    testCentresField.value = testCentres.join(',')
    startDateField.value = startDate
    endDateField.value = endDate
    startTimeField.value = startTime
    endTimeField.value = endTime
    allowLaterTestDatesCheckbox.checked = allowLaterTestDates
  }
}

async function clearInputs () {
  await chrome.storage.local.remove(INPUTS_STORAGE_KEY)

  postcodeField.value = ''
  testCentresField.value = ''
  startDateField.value = ''
  endDateField.value = ''
  startTimeField.value = ''
  endTimeField.value = ''
  allowLaterTestDatesCheckbox.checked = false
}

function clearMessage () {
  messageDiv.innerHTML = ''
}

function setErrorMessage (err: any) {
  messageDiv.innerHTML = `<span style="color:red">${err}</span>`
}

function setSummaryMessage ({ postcode, testCentres, startDate, endDate, startTime, endTime }: Inputs) {
  messageDiv.innerHTML = `<div>Searching for test centers:
    <ul>
    ${testCentres.map(tc => `<li>${tc}</li>`).join('')}
    </ul>
    centered around ${postcode}<br><br>
    from ${startDate} to ${endDate}<br><br>
    between ${startTime} and ${endTime}
  `
}

init()
