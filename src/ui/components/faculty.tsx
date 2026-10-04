import { fitSize, LEAD_FACULTY, type FacultyMember } from "../../brand/faculty";

/**
 * The approved faculty photo paired with the name, role and Scholarion Academy branding.
 * Width and height come from the source file so the browser never stretches it; sizes never upscale.
 */
export function FacultyPhoto({ f = LEAD_FACULTY, size = 96, round = false, decorative = false }: { f?: FacultyMember; size?: number; round?: boolean; decorative?: boolean }) {
  if (round) {
    const s = Math.min(size, f.photo.avatarSize);
    return <img src={f.photo.avatar} width={s} height={s} alt={decorative ? "" : f.photo.alt} className="faculty-photo faculty-photo-round" loading="lazy" decoding="async" />;
  }
  const d = fitSize(f.photo, size * (f.photo.width / f.photo.height), size);
  return <img src={f.photo.src} width={d.width} height={d.height} alt={decorative ? "" : f.photo.alt} className="faculty-photo" loading="lazy" decoding="async" />;
}

export function FacultyCard({ f = LEAD_FACULTY, org, href, compact = false, note }: { f?: FacultyMember; org?: string; href?: string; compact?: boolean; note?: string }) {
  const brand = org ?? f.org;
  const name = href ? <a href={href}>{f.name}</a> : f.name;
  return (
    <figure className={`faculty-card${compact ? " faculty-card-compact" : ""}`}>
      <FacultyPhoto f={f} size={compact ? 64 : 148} round={compact} decorative />
      <figcaption>
        <strong className="faculty-name">{name}</strong>
        <span className="faculty-role">
          {f.role}, {brand}
        </span>
        {note && <span className="faculty-note">{note}</span>}
      </figcaption>
    </figure>
  );
}
