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

const getChainTokenPrice = async (
	obj: OpenOceanTypes["GetChainTokenPriceObj"]
): Promise<number> => {
	const { chainId, nativeTokenAddress } = obj;

	try {
		const req = await fetch(`${OPEN_OCEAN_BASE_URL}/${chainId}/tokenList`, {
			method: "GET",
			headers: { "Content-Type": "application/json" },
		});

		const res: OpenOceanTypes["GetTokenListResponse"] = await req.json();

		if (res.code !== 200) return -1;

		let tokenUsdValue = 0;

		res.data.forEach((token) => {
			if (token.address === nativeTokenAddress)
				tokenUsdValue = Number(token.usd);
		});

		return tokenUsdValue;
	} catch (ex) {
		console.error("\n### getChainTokenPrice catch\n", ex, "\n");
		return -1;
	}
};

const getSwapQuoteOpenOcean = async (
	obj: OpenOceanTypes["GetSwapQuoteOpenOceanObj"]
): Promise<OpenOceanTypes["GetSwapQuoteOpenOceanResponse"]> => {
	const { amount, chainId, inToken, outToken } = obj;

	try {
		const req = await fetch(
			`${OPEN_OCEAN_BASE_URL}/${chainId}/quote?amount=${amount}&gasPrice=1&inTokenAddress=${inToken}&outTokenAddress=${outToken}`,
			{
				method: "GET",
				headers: { "Content-Type": "application/json" },
			}
		);

		const res: OpenOceanTypes["GetQuoteResponse"] = await req.json();

		if (res.code !== 200)
			return {
				gas: -1,
				outTokenValueActual: -1,
				outTokenValueWorst: -1,
				dexAddress: "",
				dexCode: "",
			};

		const price = Number(res.data.outToken.usd);
		const volume = res.data.outToken.volume;

		const worstPrice = price * (1 - MAX_SLIPPAGE);

		let dexCode: string = "";
		let dexAddress: string = "";

		const _checkSubRoutes = (
			subRoutes: OpenOceanTypes["SubRoutesObject"][]
		) => {
			subRoutes.forEach((subRoute) => {
				if (subRoute.dexes.length === 1) {
					const { dex, id, percentage } = subRoute.dexes[0];

					if (percentage === 100) {
						dexCode = dex;
						dexAddress = id;
					}
				}
			});
		};

		res.data.path.routes.forEach((route) => {
			_checkSubRoutes(route.subRoutes);
		});

		if (dexCode.length === 0) {
			return {
				gas: -1,
				outTokenValueActual: -1,
				outTokenValueWorst: -1,
				dexAddress: "",
				dexCode: "",
			};
		}

		return {
			dexAddress,
			dexCode,
			gas: Number(res.data.estimatedGas),
			outTokenValueActual: volume / price,
			outTokenValueWorst: volume / worstPrice,
		};
	} catch (ex) {
		console.error("\n### getSwapQuoteOpenOcean catch\n", ex, "\n");
		return {
			gas: -1,
			outTokenValueActual: -1,
			outTokenValueWorst: -1,
			dexAddress: "",
			dexCode: "",
		};
	}
};

/*
async function monitor() {
	try {
		const { uniswap, sushi } = await getPrices();
		const profit = ((sushi - uniswap) / uniswap) * 100;
		console.log(
			`Uniswap: ${uniswap}, Sushi: ${sushi}, Profit: ${profit.toFixed(2)}%`
		);

		if (profit >= minProfitPercent) {
			console.log("Triggering flash loan arbitrage...");
			// const tx = await contract.executeFlashLoan(USDT, ethers.utils.parseUnits("100000", 6)); // 100K USDT
			// await tx.wait();
			console.log("Arbitrage executed.");
		}
	} catch (err: any) {
		console.error("Error:", err.message);
	}
}
*/

const monitorTwo = async () => {
	console.log("\n\n");
	logger.newLog("log", "Polygon USDT-WETH Arbitrage", "Checking Web3 Space...");

	const { chainId, nativeTokenAddress } = openOceanChains.polygon;
	const { USDT, WETH } = polygonTokenAddresses;

	const ogAmount = 100_000;
	const loanFee = ogAmount * AAVE_LOAN_RATE;

	const [tokenPrice, firstSwap] = await Promise.all([
		getChainTokenPrice({ chainId, nativeTokenAddress }),
		getSwapQuoteOpenOcean({
			amount: ogAmount,
			chainId,
			inToken: USDT,
			outToken: WETH,
		}),
	]);

	if (tokenPrice === -1) {
		logger.log(
			"error",
			"getChainTokenPrice",
			"Failed to get native token price."
		);
		return;
	}

	if (firstSwap.gas === -1) {
		logger.log(
			"error",
			"getSwapQuoteOpenOcean",
			"Failed to get viable first swap."
		);
		return;
	}

	const firstGas = (firstSwap.gas / ONE_NATIVE_TOKEN) * tokenPrice;

	const secondSwap = await getSwapQuoteOpenOcean({
		amount: firstSwap.outTokenValueWorst,
		chainId,
		inToken: WETH,
		outToken: USDT,
	});

	if (secondSwap.gas === -1) {
		logger.log(
			"error",
			"getSwapQuoteOpenOcean",
			"Failed to get viable second swap."
		);
		return;
	}

	const secondGas = (secondSwap.gas / ONE_NATIVE_TOKEN) * tokenPrice;

	// in usd
	const totalGas = firstGas + secondGas;

	const totalCost = ogAmount + totalGas + loanFee + 410;

	const profit = secondSwap.outTokenValueWorst - totalCost;

	if (!profit) {
		logger.log(
			"error",
			"Polygon USDT-WETH Arbitrage",
			"Break Even | Strat Unviable"
		);
		logger.execTime();
		return;
	}

	if (profit < 0) {
		logger.log(
			"error",
			"Polygon USDT-WETH Arbitrage",
			`Loss of ${((profit / ogAmount) * 100).toFixed(2)}% | Strat Terrible`
		);
		logger.execTime();
		return;
	}

	logger.log("stats", "Polygon USDT-WETH Arbitrage", "Arbitrage Found!");

	console.log("\nDeFi Arbitrage Strat (Worst Case) - Polygon");
	console.log(`   1. Loan ${numParse(ogAmount)} USDT`);
	console.log(`      • Loan Fee ${numParse(loanFee.toFixed(4))} USDT`);
	console.log(
		`   2. Swap USDT on ${firstSwap.dexCode} for ${numParse(
			firstSwap.outTokenValueWorst.toFixed(4)
		)} WETH`
	);
	console.log(`      • Gas ${numParse(firstGas.toFixed(4))} USDT`);
	console.log(
		`   3. Swap WETH on ${secondSwap.dexCode} for ${numParse(
			secondSwap.outTokenValueWorst.toFixed(4)
		)} USDT`
	);
	console.log(`      • Gas ${numParse(secondGas.toFixed(4))} USDT`);
	console.log(`   4. Pay Back Loan`);
	console.log(
		`      • Total Cost: ${numParse((totalGas + loanFee).toFixed(4))} USDT`
	);
	console.log(`      • Net Proft: ${numParse(profit.toFixed(4))} USDT`);
	console.log(`      • NPM: ${((profit / ogAmount) * 100).toFixed(2)}%\n`);

	logger.execTime();
};

const monitorThree = async () => {
	console.log("\n\n");
	logger.newLog("log", "Polygon USDT-WETH Arbitrage", "Checking Web3 Space...");

	const { chainId, nativeTokenAddress } = openOceanChains.polygon;
	const { USDT, WETH } = polygonTokenAddresses;

	const ogAmount = 1_000;

	const [tokenPrice, firstSwap] = await Promise.all([
		getChainTokenPrice({ chainId, nativeTokenAddress }),
		getSwapQuoteOpenOcean({
			amount: ogAmount,
			chainId,
			inToken: USDT,
			outToken: WETH,
		}),
	]);

	if (tokenPrice === -1) {
		logger.log(
			"error",
			"getChainTokenPrice",
			"Failed to get native token price."
		);
		return;
	}

	if (firstSwap.gas === -1) {
		logger.log(
			"error",
			"getSwapQuoteOpenOcean",
			"Failed to get viable first swap."
		);
		return;
	}

	const firstGas = (firstSwap.gas / ONE_NATIVE_TOKEN) * tokenPrice;

	const secondSwap = await getSwapQuoteOpenOcean({
		amount: firstSwap.outTokenValueWorst,
		chainId,
		inToken: WETH,
		outToken: USDT,
	});

	if (secondSwap.gas === -1) {
		logger.log(
			"error",
			"getSwapQuoteOpenOcean",
			"Failed to get viable second swap."
		);
		return;
	}

	const secondGas = (secondSwap.gas / ONE_NATIVE_TOKEN) * tokenPrice;

	// in usd
	const totalGas = firstGas + secondGas;

	const totalCost = ogAmount + totalGas;

	const profit = secondSwap.outTokenValueWorst - totalCost;

	if (!profit) {
		logger.log(
			"error",
			"Polygon USDT-WETH Arbitrage",
			"Break Even | Strat Unviable"
		);
		logger.execTime();
		return;
	}

	if (profit < 0) {
		logger.log(
			"error",
			"Polygon USDT-WETH Arbitrage",
			`Loss of ${((profit / ogAmount) * 100).toFixed(2)}% | Strat Terrible`
		);
		logger.execTime();
		return;
	}

	logger.log("stats", "Polygon USDT-WETH Arbitrage", "Arbitrage Found!");

	console.log("\nDeFi Arbitrage Strat (Worst Case) - Polygon");
	console.log(
		`   1. Swap USDT on ${firstSwap.dexCode} for ${numParse(
			firstSwap.outTokenValueWorst.toFixed(4)
		)} WETH`
	);
	console.log(`      • Gas ${numParse(firstGas.toFixed(4))} USDT`);
	console.log(
		`   3. Swap WETH on ${secondSwap.dexCode} for ${numParse(
			secondSwap.outTokenValueWorst.toFixed(4)
		)} USDT`
	);
	console.log(`      • Gas ${numParse(secondGas.toFixed(4))} USDT`);
	console.log(`      • Total Cost: ${numParse(totalGas)} USDT`);
	console.log(`      • Net Proft: ${numParse(profit.toFixed(4))} USDT`);
	console.log(`      • NPM: ${((profit / ogAmount) * 100).toFixed(2)}%\n`);

	logger.execTime();
};

setInterval(monitorThree, 10000);
