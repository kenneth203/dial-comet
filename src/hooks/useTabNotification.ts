import { useEffect, useRef } from 'react';

const BASE_TITLE = 'The VA Team Portal';

export function useTabNotification(totalUnread: number) {
  const originalTitle = useRef(BASE_TITLE);

  useEffect(() => {
    if (totalUnread > 0) {
      document.title = `(${totalUnread}) ${originalTitle.current}`;
    } else {
      document.title = originalTitle.current;
    }

    return () => {
      document.title = originalTitle.current;
    };
  }, [totalUnread]);
}
