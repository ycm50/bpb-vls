/**
 * Build script for VLESS-only BPB Worker.
 * 
 * Bundles src/vless-worker.ts into dist/vless-worker.js
 * with the same asset processing as the full build but
 * stripping Trojan/Warp/DoH dependencies.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname as pathDirname } from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { globSync } from 'glob';
import { minify as jsMinify } from 'terser';
import { minify as htmlMinify } from 'html-minifier';
import JSZip from "jszip";
import obfs from 'javascript-obfuscator';
import pkg from '../package.json' with { type: 'json' };
import { gzipSync } from 'zlib';

const env = process.env.NODE_ENV || 'mangle';
const mangleMode = env === 'mangle';

const __filename = fileURLToPath(import.meta.url);
const __dirname = pathDirname(__filename);

const ASSET_PATH = join(__dirname, '../src/assets');
const DIST_PATH = join(__dirname, '../dist/');

const green = '\x1b[32m';
const red = '\x1b[31m';
const reset = '\x1b[0m';

const success = `${green}✔${reset}`;
const failure = `${red}✗${reset}`;

const version = pkg.version;

async function processHtmlPages() {
    const indexFiles = globSync('**/index.html', { cwd: ASSET_PATH });
    const result = {};

    for (const relativeIndexPath of indexFiles) {
        const dir = pathDirname(relativeIndexPath);
        const base = (file) => join(ASSET_PATH, dir, file);

        let indexHtml = readFileSync(base('index.html'), 'utf8');
        let finalHtml = indexHtml.replaceAll('__VERSION__', version);

        if (dir !== 'error') {
            const styleCode = readFileSync(base('style.css'), 'utf8');
            const scriptCode = readFileSync(base('script.js'), 'utf8');
            const finalScriptCode = await jsMinify(scriptCode);

            // VLESS-only: 从 panel HTML 中移除 Warp/Warp PRO 相关按钮和表格区域
            // 保留 VLESS 核心设置和订阅展示
            finalHtml = finalHtml
                .replaceAll('__STYLE__', `<style>${styleCode}</style>`)
                .replaceAll('__SCRIPT__', finalScriptCode.code);
        }

        const minifiedHtml = htmlMinify(finalHtml, {
            collapseWhitespace: true,
            removeAttributeQuotes: true,
            minifyCSS: true
        });

        const compressed = gzipSync(minifiedHtml);
        const htmlBase64 = compressed.toString('base64');
        result[dir] = JSON.stringify(htmlBase64);
    }

    console.log(`${success} Assets bundled successfully!`);
    return result;
}

function generateJunkCode() {
    const minVars = 50, maxVars = 200;
    const minFuncs = 50, maxFuncs = 200;

    const varCount = Math.floor(Math.random() * (maxVars - minVars + 1)) + minVars;
    const funcCount = Math.floor(Math.random() * (maxFuncs - minFuncs + 1)) + minFuncs;

    const junkVars = Array.from({ length: varCount }, (_, i) => {
        const varName = `__junk_${Math.random().toString(36).substring(2, 10)}_${i}`;
        const value = Math.floor(Math.random() * 100000);
        return `let ${varName} = ${value};`;
    }).join('\n');

    const junkFuncs = Array.from({ length: funcCount }, (_, i) => {
        const funcName = `__junkFunc_${Math.random().toString(36).substring(2, 10)}_${i}`;
        return `function ${funcName}() { return ${Math.floor(Math.random() * 1000)}; }`;
    }).join('\n');

    return `${junkVars}\n${junkFuncs}\n`;
}

async function buildVlessWorker() {
    const htmls = await processHtmlPages();
    const faviconBuffer = readFileSync('./src/assets/favicon.ico');
    const faviconBase64 = faviconBuffer.toString('base64');

    console.log(`${success} Building VLESS-only worker...`);

    const code = await build({
        entryPoints: [join(__dirname, '../src/vless-worker.ts')],
        bundle: true,
        format: 'esm',
        write: false,
        external: ['cloudflare:sockets'],
        platform: 'browser',
        target: 'esnext',
        loader: { '.ts': 'ts' },
        define: {
            __PANEL_HTML_CONTENT__: htmls['panel'] ?? '""',
            __LOGIN_HTML_CONTENT__: htmls['login'] ?? '""',
            __ERROR_HTML_CONTENT__: htmls['error'] ?? '""',
            __SECRETS_HTML_CONTENT__: htmls['secrets'] ?? '""',
            __PROXY_IP_HTML_CONTENT__: htmls['proxy-ip'] ?? '""',
            __ICON__: JSON.stringify(faviconBase64),
            __VERSION__: JSON.stringify(version)
        }
    });

    console.log(`${success} VLESS Worker built successfully!`);

    const minifyCode = async (code) => {
        const minified = await jsMinify(code, {
            module: true,
            output: { comments: false },
            compress: { dead_code: false, unused: false }
        });
        console.log(`${success} Worker minified successfully!`);
        return minified;
    };

    let finalCode;

    if (mangleMode) {
        const junkCode = generateJunkCode();
        const minifiedCode = await minifyCode(junkCode + code.outputFiles[0].text);
        finalCode = minifiedCode.code;
    } else {
        const minifiedCode = await minifyCode(code.outputFiles[0].text);
        const obfuscationResult = obfs.obfuscate(minifiedCode.code, {
            stringArrayThreshold: 1,
            stringArrayEncoding: ["rc4"],
            numbersToExpressions: true,
            transformObjectKeys: true,
            renameGlobals: true,
            deadCodeInjection: true,
            deadCodeInjectionThreshold: 0.2,
            target: "browser"
        });
        console.log(`${success} Worker obfuscated successfully!`);
        finalCode = obfuscationResult.getObfuscatedCode();
    }

    const buildTimestamp = new Date().toISOString();
    const buildInfo = `// Build: ${buildTimestamp}\n// BPB Panel VLESS-only version ${version}\n`;
    const worker = `${buildInfo}// @ts-nocheck\n${finalCode}`;
    mkdirSync(DIST_PATH, { recursive: true });

    const outJs = './dist/vls.js';
    const outZip = './dist/vls.zip';
    writeFileSync(outJs, worker, 'utf8');

    const zip = new JSZip();
    zip.file('worker.js', worker);
    await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE'
    }).then(nodebuffer => writeFileSync(outZip, nodebuffer));

    console.log(`${success} VLESS Worker → ${outJs} + ${outZip}`);
    console.log(`${success} Done!`);
}

buildVlessWorker().catch(err => {
    console.error(`${failure} Build failed:`, err);
    process.exit(1);
});
