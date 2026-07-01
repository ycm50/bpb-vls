import { buildWebsocketOutbound } from '../../cores/clash/outbounds';
import type { VlessOutbound } from '#types/clash';

/**
 * Build a VLESS-specific outbound for Clash.
 * Wraps the shared buildWebsocketOutbound with the VLESS protocol constant.
 */
export function buildVlessOutbound(
    remark: string,
    address: string,
    port: number
): VlessOutbound | null {
    const { _VL_ } = globalThis.dict;
    return buildWebsocketOutbound(_VL_, remark, address, port) as VlessOutbound | null;
}
