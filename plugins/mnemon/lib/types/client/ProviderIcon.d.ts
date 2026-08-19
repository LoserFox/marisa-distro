import type { MemoryProviderId } from '../shared/contracts.ts';
export interface ProviderIconProps {
    providerId: MemoryProviderId;
    className?: string | undefined;
    title?: string | undefined;
}
/** Provider brand mark. Official assets are bundled locally; Holographic uses its canonical mirror motif. */
export declare function ProviderIcon({ providerId, className, title }: ProviderIconProps): JSX.Element;
