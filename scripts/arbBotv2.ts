import dotenv from "dotenv";
import { ethers } from "ethers";
import { numParse, Logger } from "@cerebrusinc/qol";

import type { OpenOceanTypes } from "./openOcean.types";

dotenv.config();

const provider = new ethers.providers.JsonRpcProvider(process.env.RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);

const flashLoanAddress = "YOUR_DEPLOYED_CONTRACT_ADDRESS";
const flashLoanAbi = [
	"function executeFlashLoan(address asset, uint256 amount) external",
];

const contract = new ethers.Contract(flashLoanAddress, flashLoanAbi, wallet);

const OPEN_OCEAN_BASE_URL = process.env.OPEN_OCEAN_BASE_URL as string;

/**In GWEI */
const ONE_NATIVE_TOKEN = 1_000_000_000;
/**In native token */
const ONE_GWEI = 0.000_000_001;

const MAX_SLIPPAGE = 0.03;
const AAVE_LOAN_RATE = 0.0009;

const logger = new Logger();

const openOceanChains = {
	ethereum: {
		chainId: 1,
		nativeTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
	},
	bnb: {
		chainId: 56,
		nativeTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
	},
	polygon: {
		chainId: 137,
		nativeTokenAddress: "0x0000000000000000000000000000000000001010",
	},
	avalanche: {
		chainId: 43114,
		nativeTokenAddress: "0x0000000000000000000000000000000000000000",
	},
	arbitrum: {
		chainId: 42161,
		nativeTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
	},
	optimism: {
		chainId: 10,
		nativeTokenAddress: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE",
	},
};

const polygonTokenAddresses = {
	USDC: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
	/**Japanese Yen Coin */
	JPYC: "0x431D5dfF03120AFA4bDf332c61A6e1766eF37BDB",
	POL: "0x0000000000000000000000000000000000001010",
	WETH: "0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619",
	/**wrapped btc */
	WBTC: "0x1BFD67037B42Cf73acF2047067bd4F2C47D9BfD6",
	ANKR: "0x101A023270368c0D50BFfb62780F4aFd4ea79C35",
	SUSHI: "0x0b3f868e0be5597d5db7feb59e1cadbb0fdda50a",
	DAI: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
	AAVE: "0xD6DF932A45C0f255f85145f286eA0b292B21C90B",
	USDT: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F",
	LINK: "0x53E0bca35eC356BD5ddDFebbD1Fc0fD03FaBad39",
};

// helpers
const toUnits = (wei: string, decimals: number) =>
	Number(ethers.utils.formatUnits(wei, decimals));
const fromUnits = (amt: number, decimals: number) =>
	ethers.utils.parseUnits(amt.toString(), decimals);

async function getNativeUsd(chainId: number, nativeTokenAddress: string) {
	const r = await fetch(`${OPEN_OCEAN_BASE_URL}/${chainId}/tokenList`);
	const j = await r.json();
	if (j.code !== 200) return -1;
	const token = j.data.find(
		(t: any) => t.address.toLowerCase() === nativeTokenAddress.toLowerCase()
	);

	//console.log("--- getNativeUsd token obj\n", token, "\n---");

	return token ? Number(token.usd) : -1;
}

async function getQuote({
	chainId,
	inToken,
	outToken,
	amountWei, // already in smallest units
	gasPriceWei, // current gas price in Wei
	slippagePct = 3, // slippage in %
}: {
	chainId: number;
	inToken: string;
	outToken: string;
	amountWei: string; // smallest units string
	gasPriceWei: string; // smallest units string
	slippagePct?: number; // ex: 0.3 = 0.3%
}) {
	const url = `${OPEN_OCEAN_BASE_URL}/${chainId}/quote?inTokenAddress=${inToken}&outTokenAddress=${outToken}&amountDecimals=${amountWei}&gasPriceDecimals=${gasPriceWei}&slippage=${slippagePct}`;

	/*
	console.log(
		"\n### getQuote obj\n",
		{
			chainId,
			inToken,
			outToken,
			amountWei,
			gasPriceWei,
			slippagePct,
			url,
		},
		"\n###"
	);
	*/

	const r = await fetch(url, {
		headers: { "Content-Type": "application/json" },
	});
	const j = await r.json();
	if (j.code !== 200) return null;

	const data = j.data;
	return {
		gasUnits: Number(data.estimatedGas), // units
		outAmountWei: data.outAmount, // smallest units
		minOutAmountWei: data.minOutAmount ?? data.outAmountWorst ?? data.outAmount, // pick safest
		outDecimals: data.outToken.decimals,
		route: data.path, // keep full route (may be split)
	};
}

async function gasUsdCost(
	provider: ethers.providers.JsonRpcProvider,
	gasUnits: number,
	nativeUsd: number
) {
	const gasPriceWei = await provider.getGasPrice();
	const wei = gasPriceWei.mul(gasUnits);
	const native = Number(ethers.utils.formatEther(wei));
	return { usd: native * nativeUsd, native, gasPriceWei };
}

let running = false;

async function monitorPolygonUSDT_WETH() {
	if (running) return;
	running = true;
	try {
		const { chainId, nativeTokenAddress } = openOceanChains.polygon;
		const { USDT, WETH } = polygonTokenAddresses;

		const inDecimals = 6; // USDT
		const outDecimals = 18; // WETH

		const notionalUSDT = 1000; // human units
		const amountInWei = ethers.utils
			.parseUnits(notionalUSDT.toString(), inDecimals)
			.toString();

		// get native token price in USD
		const nativeUsd = await getNativeUsd(chainId, nativeTokenAddress);
		if (nativeUsd <= 0) {
			logger.log("error", "nativeUsd", "Failed");
			return;
		}

		// fetch gas price
		const gasPriceWei = await provider.getGasPrice().then((g) => g.toString());

		// Quote 1: USDT → WETH
		const q1 = await getQuote({
			chainId,
			inToken: USDT,
			outToken: WETH,
			amountWei: amountInWei,
			gasPriceWei,
			slippagePct: 0.3, // tighter default slippage
		});

		if (!q1) {
			logger.newLog("error", "quote1", "No quote");
			return;
		}

		//console.log("\n+++ q1\n", q1, "\n+++");

		const g1 = await gasUsdCost(provider, q1.gasUnits, nativeUsd);

		const minWethNoFee = toUnits(
			q1.minOutAmountWei,
			q1.outDecimals ?? outDecimals
		);

		// Apply OpenOcean fee (0.1% = 0.001)
		const feeRate = 0.001;
		const minWeth = minWethNoFee * (1 - feeRate);

		const amountBackInWei = ethers.utils
			.parseUnits(minWeth.toString(), outDecimals)
			.toString();

		// Quote 2: WETH → USDT
		const q2 = await getQuote({
			chainId,
			inToken: WETH,
			outToken: USDT,
			amountWei: amountBackInWei,
			gasPriceWei,
			slippagePct: 0.3, // also keep consistent
		});

		if (!q2) {
			logger.newLog("error", "quote2", "No quote");
			return;
		}

		//console.log("\n+++ q2\n", q2, "\n+++");

		const g2 = await gasUsdCost(provider, q2.gasUnits, nativeUsd);
		const minUsdtBackNoFee = toUnits(q2.minOutAmountWei, inDecimals);

		// Apply fee again (0.1%)
		const minUsdtBack = minUsdtBackNoFee * (1 - feeRate);

		const totalGasUsd = g1.usd + g2.usd;
		const grossPnl = minUsdtBack - notionalUSDT; // in USDT
		const netPnl = grossPnl - totalGasUsd;

		/*
		console.log(
			"\n\n>>>>>>>>> FINAL CALCS",
			{ notionalUSDT, minUsdtBack, totalGasUsd, minWeth },
			"\n"
		);
		*/

		const npm = ((netPnl / notionalUSDT) * 100).toFixed(4) + "%";

		console.log(
			"\n=======================\n",
			{
				notionalUSDT,
				minUsdtBack,
				minUsdtBackNoFee,
				totalGasUsd,
				minWeth,
				grossPnl,
				netPnl,
				npm,
			},
			"\n=======================\n"
		);

		if (netPnl <= 0) {
			logger.newLog("error", "Arb", "No edge");
			return;
		}

		logger.newLog("stats", "Arb", "EDGE FOUND");

		/*
		console.log(
			"\n=======================\n",
			{ grossPnl, totalGasUsd, netPnl },
			"\n=======================\n"
		);
		*/
	} catch (e) {
		console.error(e);
	} finally {
		running = false;
	}
}

// safer than setInterval for async work
async function loop() {
	while (true) {
		await monitorPolygonUSDT_WETH();
		await new Promise((r) =>
			setTimeout(r, 10_000 + Math.floor(Math.random() * 1500))
		); // jitter to avoid sync spikes
	}
}
loop();
