const express = require('express');
const request = require('request');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const app = express();
const port = 3000;

let browser;

// Iniciar Puppeteer una vez y reutilizar la instancia del navegador
(async () => {
    browser = await puppeteer.launch({ headless: true });
})();

app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

app.use('/proxy', (req, res) => {
    const url = 'https://geoforestal.icf.gob.hn' + req.url;
    req.pipe(request(url)).pipe(res);
});

app.use(bodyParser.json());

app.post('/generate-pdf', async (req, res) => {
    try {
        const { dictamenUrl, mapaUrl } = req.body;
        console.log('Generating PDF for dictamenUrl:', dictamenUrl);
        console.log('Generating PDF for mapaUrl:', mapaUrl);
        
        const dictamenBuffer = await generateDictamenPDF(dictamenUrl);
        console.log('Dictamen PDF Buffer Length:', dictamenBuffer.length);
        
        const mapaBuffer = await generateMapaPDF(mapaUrl);
        console.log('Mapa PDF Buffer Length:', mapaBuffer.length);
        res.json({
            dictamen: dictamenBuffer.toString('base64'),
            mapa: mapaBuffer.toString('base64')
        });
        console
    } catch (error) {
        console.error(error);
        res.status(500).send('Error generating PDF');
    }
});

async function generateDictamenPDF(url) {
    try {
        const page = await browser.newPage();

        const downloadPath = path.resolve('downloads');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath);
        }

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });

        await page.goto(url, { waitUntil: 'networkidle2' });

        // Esperar a que el archivo se descargue
        const dictamenFileName = 'dictamen.pdf';
        const dictamenFilePath = path.join(downloadPath, dictamenFileName);

        // Borrar archivo anterior si existe
        if (fs.existsSync(dictamenFilePath)) {
            fs.unlinkSync(dictamenFilePath);
        }

        // Esperar a que el archivo PDF se descargue
        let timeout = 30000; // 30 segundos
        const pollInterval = 1000; // 1 segundo
        while (timeout > 0 && !fs.existsSync(dictamenFilePath)) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            timeout -= pollInterval;
        }

        if (!fs.existsSync(dictamenFilePath)) {
            throw new Error('Descarga del PDF fallida o tiempo de espera agotado.');
        }

        const dictamenBuffer = fs.readFileSync(dictamenFilePath);
        await page.close();

        // Eliminar el archivo descargado después de leerlo
        fs.unlinkSync(dictamenFilePath);

        return dictamenBuffer;
    } catch (error) {
        console.error('Error generating Dictamen PDF:', error);
        throw error;
    }
}

async function generateMapaPDF(url) {
    try {
        console.log('Opening new page for Mapa PDF...');
        const page = await browser.newPage();

        const downloadPath = path.resolve('downloads');
        if (!fs.existsSync(downloadPath)) {
            fs.mkdirSync(downloadPath);
        }

        const client = await page.target().createCDPSession();
        await client.send('Page.setDownloadBehavior', {
            behavior: 'allow',
            downloadPath: downloadPath
        });

        console.log('Navigating to URL:', url);
        await page.goto(url, { waitUntil: 'networkidle2' });

        // Borrar archivo anterior si existe
        const mapaFileName = 'mapfish-print-report.pdf';
        const mapaFilePath = path.join(downloadPath, mapaFileName);
        if (fs.existsSync(mapaFilePath)) {
            fs.unlinkSync(mapaFilePath);
        }

        console.log('Waiting for new page to be created...');
        // Esperar a que se abra una nueva ventana
        const newPagePromise = new Promise((resolve, reject) => {
            let timeout = setTimeout(() => reject(new Error('New page creation timed out')), 10000); // 10 segundos
            browser.once('targetcreated', async (target) => {
                clearTimeout(timeout);
                const newPage = await target.page();
                resolve(newPage);
            });
        });

        let newPage;
        try {
            newPage = await newPagePromise;
            console.log('New page created, handling download...');
        } catch (error) {
            console.log('No new page detected within timeout, proceeding with the current page...');
        }

        if (newPage) {
            const newClient = await newPage.target().createCDPSession();
            await newClient.send('Page.setDownloadBehavior', {
                behavior: 'allow',
                downloadPath: downloadPath
            });

            await newPage.waitForNavigation({ waitUntil: 'networkidle2' });

            // Esperar a que el archivo PDF se descargue en la nueva ventana
            let timeout = 30000; // 30 segundos
            const pollInterval = 1000; // 1 segundo
            while (timeout > 0 && !fs.existsSync(mapaFilePath)) {
                await new Promise(resolve => setTimeout(resolve, pollInterval));
                timeout -= pollInterval;
            }

            if (!fs.existsSync(mapaFilePath)) {
                throw new Error('Descarga del PDF fallida o tiempo de espera agotado.');
            }

            console.log('Reading Mapa PDF file...');
            const mapaBuffer = fs.readFileSync(mapaFilePath);
            await newPage.close();

            // Eliminar el archivo descargado después de leerlo
            fs.unlinkSync(mapaFilePath);

            return mapaBuffer;
        }

        console.log('Checking for PDF in current page...');
        // Si no se abre una nueva ventana, esperar a que el archivo PDF se descargue en la ventana original
        let timeout = 30000; // 30 segundos
        const pollInterval = 1000; // 1 segundo
        while (timeout > 0 && !fs.existsSync(mapaFilePath)) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            timeout -= pollInterval;
        }

        if (!fs.existsSync(mapaFilePath)) {
            throw new Error('Descarga del PDF fallida o tiempo de espera agotado.');
        }

        console.log('Reading Mapa PDF file...');
        const mapaBuffer = fs.readFileSync(mapaFilePath);
        await page.close();

        // Eliminar el archivo descargado después de leerlo
        fs.unlinkSync(mapaFilePath);

        return mapaBuffer;
    } catch (error) {
        console.error('Error generating Mapa PDF:', error);
        throw error;
    }
}

app.listen(port, () => {
    console.log(`Proxy server listening at http://localhost:${port}`);
});
