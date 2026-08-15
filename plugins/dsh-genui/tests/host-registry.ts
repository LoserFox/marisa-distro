/**
 * Feature-detected custom-component registration for the test suite: the
 * host ships `registerGenuiComponent` only on the contract line. The gated
 * registry tests never call it on pristine hosts, but the named import must
 * still resolve — hence the indirection with a safe typed throw.
 */
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import type { ComponentType } from 'react'

type HostGenuiExt = {
  registerGenuiComponent?: (type: string, component: ComponentType<unknown>) => () => void
}

export const registerGenuiComponent: NonNullable<HostGenuiExt['registerGenuiComponent']> = (type, component) => {
  const fn = (primitives as unknown as HostGenuiExt).registerGenuiComponent
  if (typeof fn !== 'function') throw new Error('registerGenuiComponent unavailable (pristine host); registry tests must be gated')
  return fn(type, component)
}
