// authenticity-nft.test.ts
import { describe, it, expect, beforeEach } from "vitest";

interface Metadata {
  serialNumber: string;
  brand: string;
  model: string;
  productionDate: number;
  materials: string;
  authenticityHash: string; // Simulate buff as hex string
}

interface Result<T> {
  value?: T;
  error?: number;
}

const mockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM" as string,
  paused: false as boolean,
  lastTokenId: 0n as bigint,
  tokenOwners: new Map<bigint, string>(),
  tokenUris: new Map<bigint, string>(),
  tokenMetadata: new Map<bigint, Metadata>(),
  approvals: new Map<string, boolean>(), // key: `${tokenId}-${operator}`
  ownerTokenCount: new Map<string, bigint>(),
  ownerTokens: new Map<string, bigint>(), // key: `${owner}-${index}`
  tokenIndexes: new Map<bigint, bigint>(),
  MAX_TOKENS: 1000000n as bigint,

  isAdmin(caller: string): boolean {
    return caller === this.admin;
  },

  ensureNotPaused(): Result<boolean> {
    if (this.paused) return { error: 103 };
    return { value: true };
  },

  isOwnerOrApproved(tokenId: bigint, sender: string): boolean {
    const owner = this.tokenOwners.get(tokenId) || "SP000000000000000000002Q6VF78";
    const approved = this.approvals.get(`${tokenId.toString()}-${sender}`) || false;
    return sender === owner || approved;
  },

  transferAdmin(caller: string, newAdmin: string): Result<boolean> {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (newAdmin === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.admin = newAdmin;
    return { value: true };
  },

  setPaused(caller: string, pause: boolean): Result<boolean> {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: true };
  },

  mint(
    caller: string,
    recipient: string,
    uri: string,
    metadata: Metadata
  ): Result<bigint> {
    if (!this.isAdmin(caller)) return { error: 100 };
    const pauseCheck = this.ensureNotPaused();
    if (pauseCheck.error) return { error: pauseCheck.error };
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
    const tokenId = this.lastTokenId + 1n;
    if (tokenId > this.MAX_TOKENS) return { error: 107 };
    if (this.tokenOwners.has(tokenId)) return { error: 106 };
    this.tokenOwners.set(tokenId, recipient);
    this.tokenUris.set(tokenId, uri);
    this.tokenMetadata.set(tokenId, metadata);
    // Enumeration
    const count = this.ownerTokenCount.get(recipient) || 0n;
    this.ownerTokenCount.set(recipient, count + 1n);
    this.ownerTokens.set(`${recipient}-${count.toString()}`, tokenId);
    this.tokenIndexes.set(tokenId, count);
    this.lastTokenId = tokenId;
    return { value: tokenId };
  },

  transfer(caller: string, tokenId: bigint, recipient: string): Result<boolean> {
    const pauseCheck = this.ensureNotPaused();
    if (pauseCheck.error) return pauseCheck;
    if (recipient === "SP000000000000000000002Q6VF78") return { error: 105 };
    if (!this.tokenOwners.has(tokenId)) return { error: 104 };
    if (!this.isOwnerOrApproved(tokenId, caller)) return { error: 101 };
    const sender = this.tokenOwners.get(tokenId)!;
    // Update owner
    this.tokenOwners.set(tokenId, recipient);
    // Remove approval
    this.approvals.delete(`${tokenId.toString()}-${caller}`);
    // Update enumeration
    const senderCount = this.ownerTokenCount.get(sender)!;
    const recipientCount = this.ownerTokenCount.get(recipient) || 0n;
    const index = this.tokenIndexes.get(tokenId)!;
    // Remove from sender
    if (senderCount > 1n) {
      const lastToken = this.ownerTokens.get(`${sender}-${(senderCount - 1n).toString()}`)!;
      this.ownerTokens.set(`${sender}-${index.toString()}`, lastToken);
      this.tokenIndexes.set(lastToken, index);
    }
    this.ownerTokenCount.set(sender, senderCount - 1n);
    // Add to recipient
    this.ownerTokens.set(`${recipient}-${recipientCount.toString()}`, tokenId);
    this.tokenIndexes.set(tokenId, recipientCount);
    this.ownerTokenCount.set(recipient, recipientCount + 1n);
    return { value: true };
  },

  burn(caller: string, tokenId: bigint): Result<boolean> {
    const pauseCheck = this.ensureNotPaused();
    if (pauseCheck.error) return pauseCheck;
    if (!this.tokenOwners.has(tokenId)) return { error: 104 };
    if (caller !== this.tokenOwners.get(tokenId)) return { error: 101 };
    const owner = caller;
    const count = this.ownerTokenCount.get(owner)!;
    const index = this.tokenIndexes.get(tokenId)!;
    // Remove from enumeration
    if (count > 1n) {
      const lastToken = this.ownerTokens.get(`${owner}-${(count - 1n).toString()}`)!;
      this.ownerTokens.set(`${owner}-${index.toString()}`, lastToken);
      this.tokenIndexes.set(lastToken, index);
    }
    this.ownerTokens.delete(`${owner}-${(count - 1n).toString()}`);
    this.ownerTokenCount.set(owner, count - 1n);
    this.tokenIndexes.delete(tokenId);
    // Delete data
    this.tokenOwners.delete(tokenId);
    this.tokenUris.delete(tokenId);
    this.tokenMetadata.delete(tokenId);
    return { value: true };
  },

  approve(caller: string, tokenId: bigint, operator: string): Result<boolean> {
    const pauseCheck = this.ensureNotPaused();
    if (pauseCheck.error) return pauseCheck;
    const owner = this.tokenOwners.get(tokenId) || "SP000000000000000000002Q6VF78";
    if (caller !== owner) return { error: 101 };
    if (operator === "SP000000000000000000002Q6VF78") return { error: 105 };
    this.approvals.set(`${tokenId.toString()}-${operator}`, true);
    return { value: true };
  },

  revoke(caller: string, tokenId: bigint, operator: string): Result<boolean> {
    const pauseCheck = this.ensureNotPaused();
    if (pauseCheck.error) return pauseCheck;
    const owner = this.tokenOwners.get(tokenId) || "SP000000000000000000002Q6VF78";
    if (caller !== owner) return { error: 101 };
    this.approvals.delete(`${tokenId.toString()}-${operator}`);
    return { value: true };
  },

  verifyAuthenticity(tokenId: bigint, providedHash: string): boolean {
    const metadata = this.tokenMetadata.get(tokenId);
    if (!metadata) return false;
    return metadata.authenticityHash === providedHash;
  },
};

describe("Authenticity NFT Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.lastTokenId = 0n;
    mockContract.tokenOwners.clear();
    mockContract.tokenUris.clear();
    mockContract.tokenMetadata.clear();
    mockContract.approvals.clear();
    mockContract.ownerTokenCount.clear();
    mockContract.ownerTokens.clear();
    mockContract.tokenIndexes.clear();
  });

  it("should allow admin to mint NFT", () => {
    const metadata: Metadata = {
      serialNumber: "SN123",
      brand: "LuxBrand",
      model: "ModelX",
      productionDate: 20230101,
      materials: "Gold, Diamond",
      authenticityHash: "0xabc123",
    };
    const result = mockContract.mint(
      mockContract.admin,
      "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S",
      "ipfs://uri",
      metadata
    );
    expect(result).toEqual({ value: 1n });
    expect(mockContract.tokenOwners.get(1n)).toBe("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S");
    expect(mockContract.ownerTokenCount.get("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S")).toBe(1n);
  });

  it("should prevent non-admin from minting", () => {
    const metadata: Metadata = {
      serialNumber: "SN123",
      brand: "LuxBrand",
      model: "ModelX",
      productionDate: 20230101,
      materials: "Gold, Diamond",
      authenticityHash: "0xabc123",
    };
    const result = mockContract.mint(
      "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S",
      "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP",
      "ipfs://uri",
      metadata
    );
    expect(result).toEqual({ error: 100 });
  });

  it("should transfer NFT from owner", () => {
    const metadata: Metadata = {
      serialNumber: "SN123",
      brand: "LuxBrand",
      model: "ModelX",
      productionDate: 20230101,
      materials: "Gold, Diamond",
      authenticityHash: "0xabc123",
    };
    mockContract.mint(
      mockContract.admin,
      "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S",
      "ipfs://uri",
      metadata
    );
    const result = mockContract.transfer(
      "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S",
      1n,
      "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP"
    );
    expect(result).toEqual({ value: true });
    expect(mockContract.tokenOwners.get(1n)).toBe("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
    expect(mockContract.ownerTokenCount.get("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S")).toBe(0n);
    expect(mockContract.ownerTokenCount.get("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP")).toBe(1n);
  });

  it("should allow approved operator to transfer", () => {
    const metadata: Metadata = {
      serialNumber: "SN123",
      brand: "LuxBrand",
      model: "ModelX",
      productionDate: 20230101,
      materials: "Gold, Diamond",
      authenticityHash: "0xabc123",
    };
    mockContract.mint(
      mockContract.admin,
      "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S",
      "ipfs://uri",
      metadata
    );
    mockContract.approve(
      "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S",
      1n,
      "ST4OPERATOR"
    );
    const result = mockContract.transfer(
      "ST4OPERATOR",
      1n,
      "ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP"
    );
    expect(result).toEqual({ value: true });
    expect(mockContract.tokenOwners.get(1n)).toBe("ST3NBRSFKX28FQ2ZJ1MAKX58HKHSDGNV5N7R21XCP");
  });

  it("should burn NFT by owner", () => {
    const metadata: Metadata = {
      serialNumber: "SN123",
      brand: "LuxBrand",
      model: "ModelX",
      productionDate: 20230101,
      materials: "Gold, Diamond",
      authenticityHash: "0xabc123",
    };
    mockContract.mint(
      mockContract.admin,
      "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S",
      "ipfs://uri",
      metadata
    );
    const result = mockContract.burn("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S", 1n);
    expect(result).toEqual({ value: true });
    expect(mockContract.tokenOwners.has(1n)).toBe(false);
    expect(mockContract.ownerTokenCount.get("ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S")).toBe(0n);
  });

  it("should verify authenticity correctly", () => {
    const metadata: Metadata = {
      serialNumber: "SN123",
      brand: "LuxBrand",
      model: "ModelX",
      productionDate: 20230101,
      materials: "Gold, Diamond",
      authenticityHash: "0xabc123",
    };
    mockContract.mint(
      mockContract.admin,
      "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S",
      "ipfs://uri",
      metadata
    );
    const valid = mockContract.verifyAuthenticity(1n, "0xabc123");
    const invalid = mockContract.verifyAuthenticity(1n, "0xwrong");
    expect(valid).toBe(true);
    expect(invalid).toBe(false);
  });

  it("should not allow actions when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const metadata: Metadata = {
      serialNumber: "SN123",
      brand: "LuxBrand",
      model: "ModelX",
      productionDate: 20230101,
      materials: "Gold, Diamond",
      authenticityHash: "0xabc123",
    };
    const mintResult = mockContract.mint(
      mockContract.admin,
      "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6RF0A4B0V5S",
      "ipfs://uri",
      metadata
    );
    expect(mintResult).toEqual({ error: 103 });
  });
});