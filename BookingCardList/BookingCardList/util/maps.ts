import { BookingCardVM } from "../types";

export type MapsProvider = "google" | "bing" | "apple";

export function buildMapsUrl(vm: BookingCardVM, provider: MapsProvider): string {
    const hasCoords = vm.latitude != null && vm.longitude != null;
    const query = hasCoords ? `${vm.latitude},${vm.longitude}` : vm.addressText;
    const q = encodeURIComponent(query);
    switch (provider) {
        case "bing":
            return `https://www.bing.com/maps?where1=${q}`;
        case "apple":
            return `https://maps.apple.com/?q=${q}`;
        default:
            return `https://www.google.com/maps/search/?api=1&query=${q}`;
    }
}

export function errMsg(e: unknown): string {
    if (e instanceof Error) return e.message;
    const anyE = e as { message?: string } | null;
    return anyE?.message ?? String(e);
}
