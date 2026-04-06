import { useEffect, useState } from "react";

export default function useIsMobile(maxWidth = 768) {
  const getInitial = () => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(`(max-width: ${maxWidth}px)`).matches;
  };

  const [isMobile, setIsMobile] = useState(getInitial);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const onChange = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, [maxWidth]);

  return isMobile;
}
