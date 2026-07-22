import * as React from "react"

const MOBILE_BREAKPOINT = 1024 // Updated for better iPad support

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const checkDevice = () => {
      const width = window.innerWidth
      const height = window.innerHeight
      const userAgent = navigator.userAgent
      
      // Detect mobile/tablet devices including iPad
      const isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      const isIPad = /iPad/.test(userAgent) || (userAgent.includes('Mac') && isTouchDevice)
      const isMobileDevice = width < MOBILE_BREAKPOINT || isIPad || /Android|iPhone|iPod|BlackBerry|Windows Phone/.test(userAgent)
      
      return isMobileDevice
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(checkDevice())
    }
    
    mql.addEventListener("change", onChange)
    setIsMobile(checkDevice())
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
