export type SLIP044ChainId = 0 | 60 | 118
export type KeyDerivationPath = string
export interface RSVSignature {
  r: string
  s: string
  v: number
}

export interface MPCSignature {
  big_r: {
    affine_point: string
  }
  s: {
    scalar: string
  }
  recovery_id: number
}
