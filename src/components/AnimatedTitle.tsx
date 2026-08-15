/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

/* Заголовок открывающегося окна/вкладки "въезжает" снизу с затуханием,
   а следом под ним слева направо проходит цветная полоска-акцент и гаснет
   (см. .title-reveal-* в index.css) — по референсу клиента (титры-заставка
   вроде логотипа "STEPS"), но для произвольного текста. Играет один раз —
   ключ ставит вызывающий код (обычно key самой вкладки/модалки), чтобы
   анимация переигрывала при каждом новом открытии. */
export const AnimatedTitle = React.forwardRef<HTMLSpanElement, { children: React.ReactNode; className?: string }>(
  function AnimatedTitle({ children, className = '' }, ref) {
    return (
      <span ref={ref} className={`title-reveal relative inline-block ${className}`}>
        <span className="title-reveal-text">{children}</span>
        <span className="title-reveal-accent" />
      </span>
    );
  }
);
