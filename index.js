import { writeFile, mkdir } from 'fs/promises'; // File System access via promises
import { existsSync } from 'fs'; // File System 
import axios from 'axios'; // HTTP client
import { resolve } from 'path'; // Easier directory path handling
import { authenticate } from '@google-cloud/local-auth'; // Google Authentication Library
import csv from 'csvtojson' // Convert CSV to JSON
import moment from 'moment'; // Handle dates
import { parse } from 'json2csv' // Convert JSON to CSV

// Variables
const endpoint = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect'
const folder = 'RESULTS' // Name of the folder (change to an appropriate name)
const file = './urls.csv' // File to add URLs
const chunkNum = 20 // Break URL list into chunks to prevent API errors
const test = { inspectionUrl: "https://jlhernando.com/blog/how-to-install-node-for-seo/", siteUrl: "https://jlhernando.com/" } // Testing object

// Create results folder
existsSync(`./${folder}/`)
  ? console.log(`${folder} folder exists`)
  : mkdir(`${folder}`);

// Custom function to read URLs file
const readUrls = async (f) => csv().fromFile(f)

// Custom function to extract data from API
const getData = async (inspectionUrl, siteUrl, authToken) => {

  // Construct data object to send to API
  const body = {
    inspectionUrl,
    siteUrl
  }

  const { data } = await axios({
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${authToken}`
    },
    url: endpoint,
    data: body,
  })
  return data
};

// Custom functions to get oAuth credentials from Google
const getCredentials = async () => {
  const { credentials } = await authenticate({
    keyfilePath: resolve('client-secret.json'),
    scopes: ['https://www.googleapis.com/auth/webmasters'],
  })
  return credentials
}


// Authenticated Request Function
(async () => {

  // Start timer
  console.time()

  // Get URLs from file
  const urls = await readUrls(file)

  // Store data from API
  const data = []
  const errors = []

  // Start counter to inform user 
  let counter = 1
  const totalChunks = Math.ceil(urls.length / chunkNum)

  // Obtain user credentials to use for the request (pop up authentication)
  console.log('Athenticating...');
  const credentials = await getCredentials().catch(err => {
    console.log('FAILED TO AUTHENTICATE USER. Check if your Google account has access to the requested url/property or if your credential-secret.json is correct')
    process.exit()
  })

  console.log('Success authenticating user');

  while (urls.length) {
    // Inform user of number of batches remaining
    console.log(`###### Requesting batch ${counter} of ${totalChunks} ######`);

    // Get chunk of URLs files
    const chunk = urls.splice(0, chunkNum)

    // Create batch of promises (array)
    const promises = chunk.map(({ url, property }) => getData(url, property, credentials.access_token));

    // Send all requests in parallel
    const rawBatchResults = await Promise.allSettled(promises);

    // Filter data from batch response
    const fulfilled = rawBatchResults.filter(({ status }) => status === 'fulfilled')
    const rejected = rawBatchResults.filter(({ status }) => status === 'rejected')

    // If any api call fails push errors to array
    if (rejected) {
      const rejectedUrls = rejected.map(({ reason }) => {
        const { inspectionUrl } = JSON.parse(reason.config.data)
        return inspectionUrl
      })
      errors.push(...rejectedUrls)
    }

    // Process fulfilled requests
    if (fulfilled) {
      fulfilled.map(({ value }, index) => {
        // Create object from response
        const inspection = value

        // Log progress with results
        console.log(`Batch ${counter} -> ${chunk[index].url}: ${JSON.stringify(value.inspectionResult.indexStatusResult.coverageState)}`)

        // Add URL to object
        inspection.url = chunk[index].url

        // Push to store data
        data.push(inspection)
      });
    }
    counter++
  }

  // Write results to JSON
  if (data.length) {
    writeFile(`./${folder}/coverage.json`, JSON.stringify(data, null, 2))

    // Transform JSON to ideal CSV
    const output = data.map(({ url, inspectionResult: { indexStatusResult } }) => {
      const cleanObj = {
        url,
        verdict: indexStatusResult.verdict,
        coverageState: indexStatusResult.coverageState,
        'Crawl allowed?': indexStatusResult.robotsTxtState,
        'Indexing allowed?': indexStatusResult.indexingState,
        'Last crawl': indexStatusResult.lastCrawlTime === '1970-01-01T00:00:00Z' ? 'Not crawled' : moment(indexStatusResult.lastCrawlTime).format('YYYY-MM-DD HH:mm:ss'),
        'Page fetch': indexStatusResult.pageFetchState,
        'User-declared canonical': indexStatusResult?.userCanonical ?? 'No User-declared canonical',
        'Google-selected canonical': indexStatusResult?.googleCanonical ?? 'Inspected URL'
      }

      if (indexStatusResult.sitemap) {
        for (const [index, sitemap] of indexStatusResult.sitemap.entries()) {
          cleanObj[`sitemap-${index + 1}`] = sitemap
        }
      }

      if (indexStatusResult.referringUrls) {
        for (const [index, refUrl] of indexStatusResult.referringUrls.entries()) {
          cleanObj[`referringUrl-${index + 1}`] = refUrl
        }
      }
      return cleanObj
    })

    // Write transformed data to CSV
    writeFile(`./${folder}/coverage.csv`, parse(output))
  }

  // Write URLs that have failed
  if (errors.length) {
    writeFile(`./${folder}/errors.json`, JSON.stringify(errors, null, 2))
  }

  // Final message
  console.log(`Retrieved Indexing status for ${data.length} URLs & encountered ${errors.length} errors`);

  console.timeEnd()
})()

