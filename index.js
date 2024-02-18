const puppeteer = require("puppeteer")
const fs = require("fs")
const cheerio = require("cheerio")

;(async () => {
  const browser = await puppeteer.launch({
    // headless: false,
    // slowMo: 100, // Uncomment to visualize test
  })
  const currentPaginationOffset = 0
  const POSTCODE = "3000"
  const page = await browser.newPage()
  await page.setViewport({ width: 1800, height: 955 })

  await enterSearchCriteria(page, POSTCODE)

  //wait for search results to load
  await page.waitForSelector("[data-testid='search-results-heading-text']")
  // Collect the links to each detail page you want to scrape
  const clinicProfiles = await page.$$eval("article a", (links) => links.map((link) => link.href))

  //this is the scrapped data results. It will be used to store the data from the pages
  let data = []

  for (let link of clinicProfiles) {
    await page.goto(link)
    await page.waitForSelector("[data-testid='hcs-header-name']")

    const content = await page.content()
    const $ = cheerio.load(content)

    try {
      const clinicName = await page.$eval("[data-testid='hcs-header-name']", (el) =>
        el.textContent.trim()
      )

      const website = await page
        .$eval('[data-testid="hcs-contact"] a[href^="http"]', (el) => {
          const href = el.href.trim()
          return href.split("//")[1] || ""
        })
        .catch((err) => "")

      const phone = await page
        .$eval('[data-testid="hcs-contact"] a[href^="tel:"]', (el) => {
          const href = el.href.trim()

          const bareNumber = href.split("tel:")[1] || ""
          const formattedPhone = bareNumber.replace(/(\d{2})(\d{3})(\d{4})/, "$1 $2 $3")
          return formattedPhone
        })
        .catch((err) => "")

      const email = await page
        .$eval('[data-testid="hcs-contact"] a[href^="mailto:"]', (el) => {
          const href = el.href.trim()
          return href.split("mailto:")[1] || ""
        })
        .catch((err) => "")

      const practitionerListToSearch = await page.$$eval(
        "[data-testid='hcs-practitioners'] .css-0",
        (practitioners) => practitioners.map((practitioner) => practitioner.textContent.trim())
      )

      for (let p of practitionerListToSearch) {
        const practitioner = p.split("General")[0]

        data.push({ clinicName, phone, email, website, practitioner })
      }
    } catch (err) {
      console.error("Error extracting data:", err)
    }
  }

  //once here is reached the page of the clinic is scraped and the data is stored in the data array
  //it's now time to navigate to the next page and repeat the process
  //health direct manages pagination via search url query params so we can just change the url to navigate to the next page
  // e.g. ?offset=10
  // const nextOffset = currentPaginationOffset + 10
  // const nextUrl = `https://www.healthdirect.gov.au/australian-health-services?offset=${nextOffset}`
  // await page.goto(nextUrl)

  // Convert the data array to CSV format
  const csvContent = data
    .map(
      ({ clinicName, phone, email, website, practitioner }) =>
        `"${clinicName}","${phone}","${email}","${website}","${practitioner}"`
    )
    .join("\n")

  const csvHeader = "Name,Phone,Email,Website,Practitioner\n"
  fs.writeFile("output.csv", csvHeader + csvContent, (err) => {
    if (err) {
      console.error("Failed to write file:", err)
    } else {
      console.log("File has been saved.")
    }
  })

  await browser.close()
})()

async function fetchClinicDetails(page, link) {
  await page.goto(link)
  await page.waitForSelector("[data-testid='hcs-header-name']")

  const clinicName = await page
    .$eval("[data-testid='hcs-header-name']", (el) => el.textContent.trim())
    .catch(() => "")
  const website = await page
    .$eval('[data-testid="hcs-contact"] a[href^="http"]', (el) => el.href.trim())
    .catch(() => "")
  const phone = await page
    .$eval(
      '[data-testid="hcs-contact"] a[href^="tel:"]',
      (el) => el.href.trim().split("tel:")[1] || ""
    )
    .catch(() => "")
  const email = await page
    .$eval(
      '[data-testid="hcs-contact"] a[href^="mailto:"]',
      (el) => el.href.trim().split("mailto:")[1] || ""
    )
    .catch(() => "")

  // Assuming practitioner names are directly visible and do not require navigation
  const practitioners = await page.$$eval("[data-testid='hcs-practitioners'] .css-0", (els) =>
    els.map((el) => el.textContent.trim().split("General")[0])
  )

  return practitioners.map((practitioner) => ({ clinicName, phone, email, website, practitioner }))
}

async function enterSearchCriteria(page, criteria) {
  await page.goto("https://www.healthdirect.gov.au/australian-health-services")

  // Click on <span> "GP (General practice)"
  await page.waitForSelector("[data-testid='st-pill-788007007']")
  await page.click("[data-testid='st-pill-788007007']")

  // Click on <label> "Enter suburb or postcode"
  await page.waitForSelector('[data-testid="location-search-label"]')
  await page.click('[data-testid="location-search-label"]')

  // Press Tab on body
  await page.waitForSelector(".chakra-ui-light")
  await page.keyboard.press("Tab")

  // Fill "3000" on <input> #react-select-location-search-select-input
  await page.waitForSelector("#react-select-location-search-select-input:not([disabled])")
  await page.type("#react-select-location-search-select-input", criteria)

  // Click on <div> "Melbourne, VIC 3000"
  await page.waitForSelector("#react-select-location-search-select-option-0")
  await page.click("#react-select-location-search-select-option-0")

  // Click on <button> "Search"
  await page.waitForSelector('[data-testid="search-btn"]')
  await Promise.all([page.click('[data-testid="search-btn"]'), page.waitForNavigation()])
}
