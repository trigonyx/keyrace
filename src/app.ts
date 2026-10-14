import pkg from '../package.json';
import { defineApp } from 'termcore/app/suite';

/** keyrace as termcore sees it: name, protocol `keyrace/1`, ports 5052/5053, `KEYRACE_*`, repo, version. */
export const APP = defineApp('keyrace', pkg);
