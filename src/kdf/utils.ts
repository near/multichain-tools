import canonicalize from 'canonicalize'
import { type KeyDerivationPath } from './types'
import pickBy from 'lodash.pickby'

export const getCanonicalizedDerivationPath = (
  derivationPath: KeyDerivationPath
): string =>
  canonicalize(
    pickBy(
      {
        chain: derivationPath.chain,
        domain: derivationPath.domain,
        meta: derivationPath.meta,
      },
      (v: any) => v !== undefined && v !== null
    )
  ) ?? ''
