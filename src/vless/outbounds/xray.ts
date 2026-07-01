import { buildWebsocketOutbound } from '../../cores/xray/outbounds';
import type { Outbound } from '#types/xray';

/**
 * Build a VLESS-specific outbound for Xray.
 * Wraps the shared buildWebsocketOutbound with the VLESS protocol constant.
 */
export function buildVlessOutbound(
    tag: string,
    address: string,
    port: number,
    isFragment: boolean,
    fragLength?: string,
    fragInterval?: string
): Outbound {
    const { _VL_ } = globalThis.dict;
    return buildWebsocketOutbound(tag, _VL_, address, port, isFragment, fragLength, fragInterval);
}
