# Google Index Inspection API 

Extract indexing status from the newest [Google Search Console API endpoint](https://developers.google.com/webmaster-tools/v1/urlInspection.index/urlInspection.index). If you want a more in-depth explanation you can read [my blog post here](https://jlhernando.com/blog/google-url-inspection-api-nodejs/).

## How to run the script

Install the necessary packages
```bash
npm install
```

Update the `urls.csv` file with the individual URLs that you would like to check in the first column and the GSC property which they belong to. Keep the headers.

```csv
url,property
https://jlhernando.com/blog/how-to-install-node-for-seo/,https://jlhernando.com/
https://jlhernando.com/blog/index-coverage-extractor/,https://jlhernando.com/
```

Update the `credentials-secret.json` using your own OAuth 2.0 Client IDs credentials from your [Google Cloud Platform account](https://console.cloud.google.com/apis/credentials).

Run the script from your terminal
```bash
npm start
```

### Progress messages

If the script is able to authenticate you from the URLs and properties you are trying to check you will see a series of progress messages:

![Success progress messages](https://jlhernando.com/img/url-inspection-message-success.jpg 'Success progress messages')

On the contrary if either your credentials don't match the set of URLs and properties you are trying to extract, you will receive a failed message and the script will stop.

![Failure message](https://jlhernando.com/img/url-inspection-message-fail.jpg 'Failure message')

### Expected output

If the script has been successful in retrieving index status data, you will have a `credentials.csv` file and a `credentials.json` file under the `RESULTS` folder (unless you have changed the name in the script).

![Coverage file output](https://jlhernando.com/img/coverage-gsc-api.jpg 'Coverage file output')

If there are any extractions errors, these will be in another file named `errors.json`