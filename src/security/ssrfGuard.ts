import dns from "node:dns/promises";
import { config } from "../config";

// RFC 1918 / RFC 5735 / RFC 6598 private, loopback, link-local (incl. the
// 169.254.169.254 cloud metadata endpoint), and reserved IPv4 ranges.
const PRIVATE_IPV4_RANGES: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, includes cloud metadata services
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isIPv4InRange(ip: string, range: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(range) & mask);
}

function isPrivateIPv4(ip: string): boolean {
  return PRIVATE_IPV4_RANGES.some(([range, bits]) => isIPv4InRange(ip, range, bits));
}

function isPrivateIPv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::" || normalized === "::1") return true; // unspecified/loopback
  if (normalized.startsWith("::ffff:")) {
    const mapped = normalized.slice("::ffff:".length);
    if (mapped.includes(".")) return isPrivateIPv4(mapped);
  }
  // unique local fc00::/7
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true;
  // link-local fe80::/10
  if (/^fe[89ab]/.test(normalized)) return true;
  return false;
}

export function isPrivateAddress(ip: string): boolean {
  return ip.includes(":") ? isPrivateIPv6(ip) : isPrivateIPv4(ip);
}

/**
 * Resolves a URL's hostname and reports whether it (or any of its resolved
 * addresses) points at a private/internal network. Fails closed: malformed
 * URLs or hostnames that don't resolve are treated as unsafe.
 *
 * Can be disabled via ALLOW_PRIVATE_NETWORK_TARGETS=true for deployments
 * that intentionally run this service inside a trusted network and want it
 * to reach internal targets (e.g. an internal wiki or dashboard).
 */
export async function isBlockedTarget(rawUrl: string): Promise<boolean> {
  if (config.allowPrivateNetworkTargets) return false;

  let hostname: string;
  try {
    hostname = new URL(rawUrl).hostname;
  } catch {
    return true;
  }

  // Literal IPs (v4 or v6) don't need a DNS lookup.
  if (/^[0-9.]+$/.test(hostname) || hostname.includes(":")) {
    return isPrivateAddress(hostname);
  }

  if (hostname === "localhost") return true;

  try {
    const addresses = await dns.lookup(hostname, { all: true, verbatim: true });
    if (addresses.length === 0) return true;
    return addresses.some((a) => isPrivateAddress(a.address));
  } catch {
    return true;
  }
}
