export async function callBackgroundScript (message: any): Promise<any> {
  const res = await chrome.runtime.sendMessage(message)

  // @ts-expect-error
  const err = res?.err
  if (err) {
    console.error(err)
    throw err
  }

  return res
}

export async function callContentScript (tabId: number, message: any) : Promise<any> {
  const res = await chrome.tabs.sendMessage(tabId, message)

  // @ts-expect-error
  const err = res?.err
  if (err) {
    console.error(err)
    throw err
  }

  return res
}
