import { getDataset } from '@kv';
import { setSettings } from '@init';
import { getXrCustomConfigs } from '@xray/configs';
import { getClNormalConfig } from '@clash/configs';
import { getSbCustomConfig } from '@sing-box/configs';
import { respond, HttpStatus } from '@common';
import { base64EncodeUtf8 } from '@common';

/**
 * Handle VLESS subscription requests.
 * Delegates to the appropriate core config generator with VLESS-only output.
 */
export async function handleVlessSubscription(
    request: Request,
    env: Env,
    pathName: string,
    subPath: string,
    client: string
): Promise<Response> {
    await setSettings(request, env);

    switch (pathName) {
        case `/sub/vless/${subPath}`:
        case `/sub/vless-raw/${subPath}`:
            return await getVlessConfig(request, env, client, false);

        case `/sub/vless-fragment/${subPath}`:
            return await getVlessConfig(request, env, client, true);

        default:
            return respond(false, HttpStatus.NOT_FOUND, 'VLESS subscription path not found.');
    }
}

async function getVlessConfig(
    request: Request,
    env: Env,
    client: string,
    isFragment: boolean
): Promise<Response> {
    const { _VL_ } = globalThis.dict;
    const { VLConfigs } = globalThis.settings;

    if (!VLConfigs) {
        return respond(false, HttpStatus.BAD_REQUEST, 'VLESS configs are disabled.');
    }

    // Delegate to core config generators which include VLESS outbounds
    switch (client) {
        case 'xray':
            return await getXrCustomConfigs(isFragment);

        case 'clash':
            return await getClNormalConfig();

        case 'sing-box':
            return await getSbCustomConfig(isFragment);

        default:
            return respond(false, HttpStatus.BAD_REQUEST, `Unsupported client: ${client}`);
    }
}

/**
 * Generate a VLESS subscription URL for the panel UI.
 */
export function generateVlessSubUrl(subPath: string, isFragment: boolean): string {
    const path = isFragment ? 'vless-fragment' : 'vless';
    return `/sub/${path}/${subPath}?app=xray#💦%20BPB%20VLESS`;
}

/**
 * Generate VLESS share link (vmess:// style for v2rayN/v2rayNG).
 * Returns a base64-encoded VLESS subscription string.
 */
export function generateVlessLinks(env: Env): string[] {
    const {
        settings: {
            cleanIPs,
            ports,
            VLConfigs,
            proxyIPMode,
            proxyIPs,
            prefixes,
            upstreamParams: { upstreamServer }
        },
        globalConfig: { userID },
        httpConfig: { hostName },
        dict: { _VL_ }
    } = globalThis;

    if (!VLConfigs) return [];

    const links: string[] = [];
    const addresses = cleanIPs.length ? cleanIPs : [hostName];
    const activePorts = ports.length ? ports : [443];

    for (const address of addresses) {
        for (const port of activePorts) {
            const isTLS = port === 443 || port === 8443 || address === upstreamServer;
            const params = new URLSearchParams({
                type: 'ws',
                path: `/${_VL_}?ed=2560`,
                host: address,
                security: isTLS ? 'tls' : 'none',
                fingerprint: globalThis.settings.fingerprint || 'chrome',
                sni: address,
                pbk: '',
                sid: '',
                spx: ''
            });

            const link = `vless://${userID}@${address}:${port}?${params.toString()}#BPB-VLESS-${address}-${port}`;
            links.push(link);
        }
    }

    return links;
}
