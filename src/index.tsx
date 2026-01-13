/* @refresh reload */
import { render } from 'solid-js/web';

import App from './app.tsx';

render(() => <App />, document.querySelector('#root') as HTMLElement);
