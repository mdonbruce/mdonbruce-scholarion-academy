/**
 * Approved faculty photographs. The original file is the source asset and is never edited,
 * regenerated or replaced with a synthetic likeness; derived files are crops only (no stretching,
 * no upscaling). Always show a photo with the person's name and Scholarion Academy branding.
 */

export interface FacultyPhoto {
  /** The approved original, byte-for-byte as supplied. */
  src: string;
  width: number;
  height: number;
  /** Top-anchored square crop for round avatars (full head kept; lower shoulders trimmed). */
  avatar: string;
  avatarSize: number;
  alt: string;
}

export interface FacultyMember {
  slug: string;
  name: string;
  shortName: string;
  role: string;
  org: string;
  photo: FacultyPhoto;
  approval: { approvedBy: string; approvedOn: string; sourceFile: string; sha256: string };
}

export const LEAD_FACULTY: FacultyMember = {
  slug: "martins-idahosa",
  name: "Dr. Martins Donbruce Idahosa",
  shortName: "Dr. Martins Idahosa",
  role: "Lead Faculty",
  org: "Scholarion Academy",
  photo: {
    src: "/brand/faculty/martins-idahosa-original.png",
    width: 127,
    height: 148,
    avatar: "/brand/faculty/martins-idahosa-avatar.png",
    avatarSize: 127,
    alt: "Dr. Martins Donbruce Idahosa, Lead Faculty, Scholarion Academy",
  },
  approval: { approvedBy: "Dr. Martins Donbruce Idahosa", approvedOn: "2026-10-04", sourceFile: "Martins (2020_11_15 17_55_30 UTC) — supplied as a 127×148 PNG", sha256: "1a9b6bbc67941a8bc11d6b4c3f072e413666123473f7ef06e7a4bb156d157945" },
};

export const FACULTY: FacultyMember[] = [LEAD_FACULTY];

export function facultyByName(name: string | null | undefined): FacultyMember | undefined {
  if (!name) return undefined;
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  return FACULTY.find((f) => [f.name, f.shortName].some((x) => x.toLowerCase().replace(/[^a-z]/g, "") === n));
}

/** Display size that never upscales the source: fits within maxW × maxH, keeping proportions. */
export function fitSize(photo: { width: number; height: number }, maxW: number, maxH = Number.POSITIVE_INFINITY) {
  const k = Math.min(1, maxW / photo.width, maxH / photo.height);
  return { width: Math.round(photo.width * k), height: Math.round(photo.height * k) };
}
