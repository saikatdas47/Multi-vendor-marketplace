/**
 * Inline icon set.
 *
 * Hand-rolled rather than pulling in an icon package: the app needs about a
 * dozen glyphs, and these ship as ~2 kB of JSX instead of a dependency whose
 * tree-shaking depends on the bundler getting it right.
 */

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.7,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

function Icon({ children, className = 'h-5 w-5', viewBox = '0 0 24 24', solid = false }) {
  return (
    <svg
      className={className}
      viewBox={viewBox}
      aria-hidden="true"
      {...(solid ? { fill: 'currentColor' } : stroke)}
    >
      {children}
    </svg>
  )
}

export const SearchIcon = (p) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </Icon>
)

export const CartIcon = (p) => (
  <Icon {...p}>
    <path d="M2.5 3h1.6a1 1 0 0 1 1 .8L6 7m0 0 1.6 7.6a1 1 0 0 0 1 .8h8.1a1 1 0 0 0 1-.75l1.8-6.9A1 1 0 0 0 18.5 6H6z" />
    <circle cx="9" cy="19.5" r="1.5" />
    <circle cx="17" cy="19.5" r="1.5" />
  </Icon>
)

export const HeartIcon = ({ solid, ...p }) => (
  <Icon solid={solid} {...p}>
    <path d="M12 20.3s-7.5-4.6-7.5-9.8A4.5 4.5 0 0 1 12 7.4a4.5 4.5 0 0 1 7.5 3.1c0 5.2-7.5 9.8-7.5 9.8z" />
  </Icon>
)

export const UserIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.75" />
    <path d="M4.5 20.2a7.5 7.5 0 0 1 15 0" />
  </Icon>
)

export const PackageIcon = (p) => (
  <Icon {...p}>
    <path d="M12 2.8 3.5 7v10L12 21.2 20.5 17V7z" />
    <path d="M3.5 7 12 11.4 20.5 7M12 11.4v9.8" />
  </Icon>
)

export const StoreIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 9.5V19a1 1 0 0 0 1 1h15a1 1 0 0 0 1-1V9.5" />
    <path d="M2.5 9.5 4.8 4.6a1 1 0 0 1 .9-.6h12.6a1 1 0 0 1 .9.6l2.3 4.9a3 3 0 0 1-5.25 2 3 3 0 0 1-5.25 0 3 3 0 0 1-5.25 0 3 3 0 0 1-3.25-2z" />
  </Icon>
)

export const SunIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </Icon>
)

export const MoonIcon = (p) => (
  <Icon {...p}>
    <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a6.8 6.8 0 0 0 10.5 10.5z" />
  </Icon>
)

export const MenuIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 6.5h17M3.5 12h17M3.5 17.5h17" />
  </Icon>
)

export const CloseIcon = (p) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icon>
)

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="m4.5 12.5 5 5 10-11" />
  </Icon>
)

export const FilterIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 6.5h17M6.5 12h11M10 17.5h4" />
  </Icon>
)

export const TruckIcon = (p) => (
  <Icon {...p}>
    <path d="M2.5 16V6.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1V16M13.5 9h3.4a1 1 0 0 1 .8.4l2.6 3.4a1 1 0 0 1 .2.6V16" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17" cy="17.5" r="1.8" />
    <path d="M8.8 17.5h6.4M2.5 17.5h2.7M18.8 17.5h2.2" />
  </Icon>
)

export const ShieldIcon = (p) => (
  <Icon {...p}>
    <path d="M12 2.8l7.5 2.8v5.9c0 4.4-3 7.9-7.5 9.7-4.5-1.8-7.5-5.3-7.5-9.7V5.6z" />
    <path d="m9 12 2 2 4-4.5" />
  </Icon>
)

export const RefreshIcon = (p) => (
  <Icon {...p}>
    <path d="M20 11.5A8 8 0 1 0 6 17M20 5v6.5h-6.5" />
  </Icon>
)

export const SparkleIcon = (p) => (
  <Icon {...p}>
    <path d="M12 3.5l1.9 4.6 4.6 1.9-4.6 1.9L12 16.5l-1.9-4.6L5.5 10l4.6-1.9zM18.5 15.5l.8 1.9 1.9.8-1.9.8-.8 1.9-.8-1.9-1.9-.8 1.9-.8z" />
  </Icon>
)

export const TrashIcon = (p) => (
  <Icon {...p}>
    <path d="M4.5 7h15M9.5 7V4.8a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7M6.5 7l.8 12.3a1 1 0 0 0 1 .95h7.4a1 1 0 0 0 1-.95L17.5 7" />
  </Icon>
)

export const PlusIcon = (p) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
)

export const MinusIcon = (p) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
)

export const ChevronRightIcon = (p) => (
  <Icon {...p}>
    <path d="m9 5.5 6.5 6.5L9 18.5" />
  </Icon>
)

/* ------------------------------------------------- dashboard navigation */

export const GridIcon = (p) => (
  <Icon {...p}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
  </Icon>
)

export const InboxIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 13.5V7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v6.5" />
    <path d="M3.5 13.5h4l1.5 2.5h6l1.5-2.5h4v3a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" />
  </Icon>
)

export const MegaphoneIcon = (p) => (
  <Icon {...p}>
    <path d="M4 11v2a1.5 1.5 0 0 0 1.5 1.5h1L8 20h2l-1-5.5h1l7 3.5V5L10 8.5H5.5A1.5 1.5 0 0 0 4 10z" />
    <path d="M18.5 9.5a3 3 0 0 1 0 5" />
  </Icon>
)

export const ClipboardIcon = (p) => (
  <Icon {...p}>
    <path d="M9 4.5h6M8 6.5H6.5a1.5 1.5 0 0 0-1.5 1.5v11a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V8a1.5 1.5 0 0 0-1.5-1.5H16" />
    <rect x="8.5" y="3" width="7" height="3.5" rx="1.2" />
    <path d="M8.5 11.5h7M8.5 15h4.5" />
  </Icon>
)

export const LayersIcon = (p) => (
  <Icon {...p}>
    <path d="m12 3.5 8 4.25-8 4.25-8-4.25z" />
    <path d="m4 12.5 8 4.25 8-4.25" />
    <path d="m4 16.75 8 4.25 8-4.25" />
  </Icon>
)

export const StarIcon = (p) => (
  <Icon {...p}>
    <path d="m12 4 2.45 5.1 5.55.72-4.05 3.83 1.02 5.5L12 16.5l-4.97 2.65 1.02-5.5L4 9.82l5.55-.72z" />
  </Icon>
)

export const SettingsIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 3.5v2M12 18.5v2M4.9 7.5l1.7 1M17.4 15.5l1.7 1M4.9 16.5l1.7-1M17.4 8.5l1.7-1" />
  </Icon>
)

export const ChatIcon = (p) => (
  <Icon {...p}>
    <path d="M20 12a7.5 7.5 0 0 1-7.5 7.5c-1.3 0-2.5-.3-3.6-.9L4.5 20l1.4-4.2A7.5 7.5 0 1 1 20 12z" />
    <path d="M8.75 11.5h6.5M8.75 14.5h4" />
  </Icon>
)

export const CreditCardIcon = (p) => (
  <Icon {...p}>
    <rect x="3" y="5.5" width="18" height="13" rx="2.5" />
    <path d="M3 10h18M6.5 14.5h3" />
  </Icon>
)
