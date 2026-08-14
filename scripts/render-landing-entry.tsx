/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { renderToString } from 'react-dom/server';
import { LandingPage } from '../src/components/LandingPage';

export function renderLandingHtml(): string {
  return renderToString(<LandingPage onEnter={() => {}} />);
}
