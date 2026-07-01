import { buildWebsocketOutbound } from '../../cores/sing-box/outbounds';
import type { VlessOutbound } from '#types/sing-box';

/**
 * Build a VLESS-specific outbound for Sing-box.
 * Wraps the shared buildWebsocketOutbound with the VLESS protocol constant.
 */
export function buildVlessOutbound(
    remark: string,
    address: string,
    port: number,
    isFragment: boolean
): VlessOutbound {
    const { _VL_ } = globalThis.dict;
    return buildWebsocketOutbound(_VL_, remark, address, port, isFragment) as VlessOutbound;
}
