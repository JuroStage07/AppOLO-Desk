// Barrel — single import point for the AppoloDesk UI kit.
//
//   import { Shell, Topbar, Brand, Main, Container, Hero, ModuleGrid,
//            ModuleCard, Card, KpiCard, KpiGrid, RowCard, IconBox,
//            Badge, StatusPill, Chip, ChipsRow, Button, PrimaryButton,
//            SecondaryButton, GhostButton, QuickCard, SearchInput,
//            Field, Sheet, EmptyState, FooterNote, Spinner, SectionTitle,
//            theme } from "../../components/ui";

export { default as Shell, shellLayoutStyle, mainScrollStyle } from "./Shell";
export { default as Topbar } from "./Topbar";
export { default as Brand } from "./Brand";
export { default as Main, Container } from "./Main";
export { default as Hero, SectionTitle } from "./Hero";
export { default as Badge } from "./Badge";
export { default as Card } from "./Card";
export { default as IconBox } from "./IconBox";
export { default as SidebarAreaIcon } from "./SidebarAreaIcon";
export { default as ModuleCard } from "./ModuleCard";
export { default as ModuleGrid } from "./ModuleGrid";
export { default as KpiCard, KpiGrid } from "./KpiCard";
export { default as RowCard } from "./RowCard";
export { default as QuickCard } from "./QuickCard";
export { default as PinsFlyout } from "./PinsFlyout";
export { default as FooterNote } from "./FooterNote";
export {
  default as Button,
  PrimaryButton,
  SecondaryButton,
  GhostButton,
} from "./Button";
export { default as StatusPill } from "./StatusPill";
export { default as Chip, ChipsRow } from "./Chip";
export { default as SearchInput } from "./SearchInput";
export { default as Field } from "./Field";
export { default as Sheet } from "./Sheet";
export { default as EmptyState } from "./EmptyState";
export { default as Spinner } from "./Spinner";

export * as theme from "../../styles/theme";
export { default as themeDefault } from "../../styles/theme";
