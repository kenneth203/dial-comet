import * as React from "react"

const SMALL_SCREEN_BREAKPOINT = 768

export function useIsSmallScreen() {
  const [isSmall, setIsSmall] = React.useState<boolean>(false)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${SMALL_SCREEN_BREAKPOINT - 1}px)`)
    const onChange = () => setIsSmall(mql.matches)
    mql.addEventListener("change", onChange)
    setIsSmall(mql.matches)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return isSmall
}
