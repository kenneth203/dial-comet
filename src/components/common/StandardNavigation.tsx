// Legacy top navigation — replaced by the navy left sidebar in AppShell.
// Kept as a no-op so existing page-level imports continue to compile.
interface StandardNavigationProps {
  currentPage?: string;
  showBackButton?: boolean;
  backLink?: string;
  backText?: string;
}

export function StandardNavigation(_props: StandardNavigationProps = {}) {
  return null;
}

export default StandardNavigation;
