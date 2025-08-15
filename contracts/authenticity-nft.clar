;; authenticity-nft.clar
;; Authenticity NFT Contract
;; Implements SIP-009 NFT trait with additional features for luxury goods authenticity
;; Includes admin controls, pausing, metadata, approvals, and enumeration

;; Note: In a real deployment, you would define or use an existing SIP-009 trait.
;; For this example, assume .sip009-nft-trait is defined elsewhere.

(define-constant ERR-NOT-AUTHORIZED u100)
(define-constant ERR-NOT-OWNER u101)
(define-constant ERR-NOT-APPROVED u102)
(define-constant ERR-PAUSED u103)
(define-constant ERR-INVALID-TOKEN-ID u104)
(define-constant ERR-ZERO-ADDRESS u105)
(define-constant ERR-TOKEN-EXISTS u106)
(define-constant ERR-MAX-TOKENS-REACHED u107)
(define-constant ERR-INVALID-METADATA u108)

(define-constant MAX-TOKENS u1000000) ;; Arbitrary max for luxury items

(define-data-var admin principal tx-sender)
(define-data-var paused bool false)
(define-data-var last-token-id uint u0)

;; Maps
(define-map token-owners uint principal)
(define-map token-uris uint (string-ascii 256))
(define-map token-metadata uint {
  serial-number: (string-ascii 64),
  brand: (string-ascii 128),
  model: (string-ascii 128),
  production-date: uint,
  materials: (string-ascii 256),
  authenticity-hash: (buff 32) ;; Hash of physical item details
})
(define-map approvals {token-id: uint, operator: principal} bool)
(define-map owner-token-count principal uint)
(define-map owner-tokens {owner: principal, index: uint} uint)
(define-map token-indexes uint uint) ;; For enumeration

;; Private helpers
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

(define-private (ensure-not-paused)
  (asserts! (not (var-get paused)) (err ERR-PAUSED))
)

(define-private (is-owner-or-approved (token-id uint) (sender principal))
  (or (is-eq sender (default-to 'SP000000000000000000002Q6VF78 (map-get? token-owners token-id)))
      (default-to false (map-get? approvals {token-id: token-id, operator: sender})))
)

;; Admin functions
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (not (is-eq new-admin 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (var-set admin new-admin)
    (ok true)
  )
)

(define-public (set-paused (pause bool))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (var-set paused pause)
    (ok true)
  )
)

;; Mint NFT
(define-public (mint (recipient principal) (uri (string-ascii 256)) (metadata {
  serial-number: (string-ascii 64),
  brand: (string-ascii 128),
  model: (string-ascii 128),
  production-date: uint,
  materials: (string-ascii 256),
  authenticity-hash: (buff 32)
}))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (ensure-not-paused)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (let ((token-id (+ (var-get last-token-id) u1)))
      (asserts! (<= token-id MAX-TOKENS) (err ERR-MAX-TOKENS-REACHED))
      (asserts! (is-none (map-get? token-owners token-id)) (err ERR-TOKEN-EXISTS))
      (map-set token-owners token-id recipient)
      (map-set token-uris token-id uri)
      (map-set token-metadata token-id metadata)
      ;; Update enumeration
      (let ((count (default-to u0 (map-get? owner-token-count recipient))))
        (map-set owner-token-count recipient (+ count u1))
        (map-set owner-tokens {owner: recipient, index: count} token-id)
        (map-set token-indexes token-id count)
      )
      (var-set last-token-id token-id)
      (print {event: "mint", token-id: token-id, recipient: recipient})
      (ok token-id)
    )
  )
)

;; Transfer NFT
(define-public (transfer (token-id uint) (recipient principal))
  (begin
    (ensure-not-paused)
    (asserts! (not (is-eq recipient 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (asserts! (is-some (map-get? token-owners token-id)) (err ERR-INVALID-TOKEN-ID))
    (asserts! (is-owner-or-approved token-id tx-sender) (err ERR-NOT-OWNER))
    (let ((sender (unwrap-panic (map-get? token-owners token-id))))
      ;; Update owner
      (map-set token-owners token-id recipient)
      ;; Remove approval if any
      (map-delete approvals {token-id: token-id, operator: tx-sender})
      ;; Update enumeration
      (let ((sender-count (unwrap-panic (map-get? owner-token-count sender)))
            (recipient-count (default-to u0 (map-get? owner-token-count recipient)))
            (index (unwrap-panic (map-get? token-indexes token-id))))
        ;; Remove from sender's list
        (if (> sender-count u1)
          (let ((last-token (unwrap-panic (map-get? owner-tokens {owner: sender, index: (- sender-count u1)}))))
            (map-set owner-tokens {owner: sender, index: index} last-token)
            (map-set token-indexes last-token index)
          )
          true
        )
        (map-set owner-token-count sender (- sender-count u1))
        ;; Add to recipient's list
        (map-set owner-tokens {owner: recipient, index: recipient-count} token-id)
        (map-set token-indexes token-id recipient-count)
        (map-set owner-token-count recipient (+ recipient-count u1))
      )
      (print {event: "transfer", token-id: token-id, from: sender, to: recipient})
      (ok true)
    )
  )
)

;; Burn NFT
(define-public (burn (token-id uint))
  (begin
    (ensure-not-paused)
    (asserts! (is-some (map-get? token-owners token-id)) (err ERR-INVALID-TOKEN-ID))
    (asserts! (is-eq tx-sender (unwrap-panic (map-get? token-owners token-id))) (err ERR-NOT-OWNER))
    (let ((owner tx-sender)
          (count (unwrap-panic (map-get? owner-token-count owner)))
          (index (unwrap-panic (map-get? token-indexes token-id))))
      ;; Remove from enumeration
      (if (> count u1)
        (let ((last-token (unwrap-panic (map-get? owner-tokens {owner: owner, index: (- count u1)}))))
          (map-set owner-tokens {owner: owner, index: index} last-token)
          (map-set token-indexes last-token index)
        )
        true
      )
      (map-delete owner-tokens {owner: owner, index: (- count u1)})
      (map-set owner-token-count owner (- count u1))
      (map-delete token-indexes token-id)
      ;; Delete token data
      (map-delete token-owners token-id)
      (map-delete token-uris token-id)
      (map-delete token-metadata token-id)
      (print {event: "burn", token-id: token-id, owner: owner})
      (ok true)
    )
  )
)

;; Approve operator
(define-public (approve (token-id uint) (operator principal))
  (begin
    (ensure-not-paused)
    (asserts! (is-eq tx-sender (default-to 'SP000000000000000000002Q6VF78 (map-get? token-owners token-id))) (err ERR-NOT-OWNER))
    (asserts! (not (is-eq operator 'SP000000000000000000002Q6VF78)) (err ERR-ZERO-ADDRESS))
    (map-set approvals {token-id: token-id, operator: operator} true)
    (ok true)
  )
)

;; Revoke approval
(define-public (revoke (token-id uint) (operator principal))
  (begin
    (ensure-not-paused)
    (asserts! (is-eq tx-sender (default-to 'SP000000000000000000002Q6VF78 (map-get? token-owners token-id))) (err ERR-NOT-OWNER))
    (map-delete approvals {token-id: token-id, operator: operator})
    (ok true)
  )
)

;; Update URI (admin only, for corrections)
(define-public (update-uri (token-id uint) (new-uri (string-ascii 256)))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? token-owners token-id)) (err ERR-INVALID-TOKEN-ID))
    (map-set token-uris token-id new-uri)
    (ok true)
  )
)

;; Update metadata (admin only)
(define-public (update-metadata (token-id uint) (new-metadata {
  serial-number: (string-ascii 64),
  brand: (string-ascii 128),
  model: (string-ascii 128),
  production-date: uint,
  materials: (string-ascii 256),
  authenticity-hash: (buff 32)
}))
  (begin
    (asserts! (is-admin) (err ERR-NOT-AUTHORIZED))
    (asserts! (is-some (map-get? token-owners token-id)) (err ERR-INVALID-TOKEN-ID))
    (map-set token-metadata token-id new-metadata)
    (ok true)
  )
)

;; Verify authenticity (read-only, checks if token exists and hash matches provided)
(define-read-only (verify-authenticity (token-id uint) (provided-hash (buff 32)))
  (match (map-get? token-metadata token-id)
    some-metadata (is-eq (get authenticity-hash some-metadata) provided-hash)
    false
  )
)

;; SIP-009 functions
(define-read-only (get-last-token-id)
  (ok (var-get last-token-id))
)

(define-read-only (get-token-uri (token-id uint))
  (ok (map-get? token-uris token-id))
)

(define-read-only (get-owner (token-id uint))
  (ok (map-get? token-owners token-id))
)

;; Additional read-only
(define-read-only (get-metadata (token-id uint))
  (ok (map-get? token-metadata token-id))
)

(define-read-only (get-balance (account principal))
  (ok (default-to u0 (map-get? owner-token-count account)))
)

(define-read-only (get-token-by-index (account principal) (index uint))
  (ok (map-get? owner-tokens {owner: account, index: index}))
)

(define-read-only (is-approved (token-id uint) (operator principal))
  (ok (default-to false (map-get? approvals {token-id: token-id, operator: operator})))
)

(define-read-only (get-admin)
  (ok (var-get admin))
)

(define-read-only (is-paused)
  (ok (var-get paused))
)