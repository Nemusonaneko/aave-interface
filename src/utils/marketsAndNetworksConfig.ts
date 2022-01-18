import { ChainId, ChainIdToNetwork } from "@aave/contract-helpers";

import {
  networkConfigs as _networkConfigs,
  ExplorerLinkBuilderConfig,
  ExplorerLinkBuilderProps,
  NetworkConfig,
  BaseNetworkConfig,
} from "../ui-config/networksConfig";
import {
  CustomMarket,
  marketsData as _marketsData,
  MarketDataType,
} from "../ui-config/marketsConfig";
import { ethers } from "ethers";

export type Pool = {
  address: string;
};

const ENABLE_TESTNET = process.env.REACT_APP_ENABLE_TESTNET === "true";

// determines if forks should be shown
const FORK_ENABLED =
  global?.window?.localStorage.getItem("forkEnabled") === "true";
// specifies which network was forked
const FORK_BASE_CHAIN_ID = Number(
  global?.window?.localStorage.getItem("forkBaseChainId") || 1
);
// specifies on which chainId the fork is running
const FORK_CHAIN_ID = Number(
  global?.window?.localStorage.getItem("forkChainId") || 3030
);
const FORK_RPC_URL =
  global?.window?.localStorage.getItem("forkRPCUrl") || "http://127.0.0.1:8545";
const FORK_WS_RPC_URL =
  global?.window?.localStorage.getItem("forkWsRPCUrl") || "ws://127.0.0.1:8545";

/**
 * Generates network configs based on networkConfigs & fork settings.
 * Forks will have a rpcOnly clone of their underlying base network config.
 */
export const networkConfigs = Object.keys(_networkConfigs).reduce(
  (acc, value) => {
    acc[value] = _networkConfigs[value];
    if (FORK_ENABLED && Number(value) === FORK_BASE_CHAIN_ID) {
      acc[FORK_CHAIN_ID] = {
        ..._networkConfigs[value],
        rpcOnly: true,
        isFork: true,
        privateJsonRPCUrl: FORK_RPC_URL,
        privateJsonRPCWSUrl: FORK_WS_RPC_URL,
        underlyingChainId: FORK_BASE_CHAIN_ID,
      };
    }
    return acc;
  },
  {} as { [key: string]: BaseNetworkConfig }
);

/**
 * Generates network configs based on marketsData & fork settings.
 * Fork markets are generated for all markets on the underlying base chain.
 */
export const marketsData = Object.keys(_marketsData).reduce((acc, value) => {
  acc[value] = _marketsData[value as keyof typeof CustomMarket];
  if (
    FORK_ENABLED &&
    _marketsData[value as keyof typeof CustomMarket].chainId ===
      FORK_BASE_CHAIN_ID
  ) {
    acc[`fork_${value}`] = {
      ..._marketsData[value as keyof typeof CustomMarket],
      chainId: FORK_CHAIN_ID,
    };
  }
  return acc;
}, {} as { [key: string]: MarketDataType });

export function getDefaultChainId() {
  return marketsData[availableMarkets[0]].chainId;
}

export function getSupportedChainIds(): number[] {
  return Array.from(
    Object.keys(marketsData).reduce((acc, value) => {
      if (
        ENABLE_TESTNET ||
        !networkConfigs[marketsData[value as keyof typeof CustomMarket].chainId]
          .isTestnet
      )
        acc.add(marketsData[value as keyof typeof CustomMarket].chainId);
      return acc;
    }, new Set<number>())
  );
}

/**
 * selectable markets (markets in a available network + forks when enabled)
 */
export const availableMarkets = Object.keys(marketsData).filter((key) =>
  getSupportedChainIds().includes(
    marketsData[key as keyof typeof CustomMarket].chainId
  )
) as CustomMarket[];

const linkBuilder =
  ({
    baseUrl,
    addressPrefix = "address",
    txPrefix = "tx",
  }: ExplorerLinkBuilderConfig) =>
  ({ tx, address }: ExplorerLinkBuilderProps): string => {
    if (tx) {
      return `${baseUrl}/${txPrefix}/${tx}`;
    }
    if (address) {
      return `${baseUrl}/${addressPrefix}/${address}`;
    }
    return baseUrl;
  };

export function getNetworkConfig(chainId: ChainId): NetworkConfig {
  const config = networkConfigs[chainId];
  if (!config) {
    // this case can only ever occure when a wallet is connected with a unknown chainId which will not allow interaction
    const name = ChainIdToNetwork[chainId];
    return {
      name: name || `unknown chainId: ${chainId}`,
      explorerLinkBuilder: () => {},
    } as unknown as NetworkConfig;
  }
  return {
    ...config,
    explorerLinkBuilder: linkBuilder({ baseUrl: config.explorerLink }),
  };
}

export const isFeatureEnabled = {
  faucet: (data: MarketDataType) => data.enabledFeatures?.faucet,
  governance: (data: MarketDataType) => data.enabledFeatures?.governance,
  staking: (data: MarketDataType) => data.enabledFeatures?.staking,
  liquiditySwap: (data: MarketDataType) => data.enabledFeatures?.liquiditySwap,
  collateralRepay: (data: MarketDataType) =>
    data.enabledFeatures?.collateralRepay,
  permissions: (data: MarketDataType) => data.enabledFeatures?.permissions,
};

const providers: { [network: string]: ethers.providers.Provider } = {};

export const getProvider = (chainId: ChainId): ethers.providers.Provider => {
  if (!providers[chainId]) {
    const config = getNetworkConfig(chainId);
    const chainProviders: ethers.providers.StaticJsonRpcProvider[] = [];
    if (config.privateJsonRPCUrl) {
      providers[chainId] = new ethers.providers.StaticJsonRpcProvider(
        config.privateJsonRPCUrl,
        chainId
      );
      return providers[chainId];
    }
    if (config.publicJsonRPCUrl.length) {
      config.publicJsonRPCUrl.map((rpc) =>
        chainProviders.push(
          new ethers.providers.StaticJsonRpcProvider(rpc, chainId)
        )
      );
    }
    if (!chainProviders.length) {
      throw new Error(`${chainId} has no jsonRPCUrl configured`);
    }
    if (chainProviders.length === 1) {
      providers[chainId] = chainProviders[0];
    } else {
      providers[chainId] = new ethers.providers.FallbackProvider(
        chainProviders
      );
    }
  }
  return providers[chainId];
};

// reexport so we can forbit config import
export { CustomMarket };
export type { MarketDataType, NetworkConfig };
