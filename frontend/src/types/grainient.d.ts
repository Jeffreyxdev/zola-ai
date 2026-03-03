// declare a module for the Grainient library so TypeScript doesn't complain
// replace this with more specific typings if you install the real package

declare module '@react-bits/Grainient-TS-TW' {
  import { ComponentType } from 'react';
  const Grainient: ComponentType<any>;
  export default Grainient;
}
