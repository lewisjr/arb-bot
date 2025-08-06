// ? GetTokenListResponse
interface ChainTokenData {
	id: number;
	code: string;
	name: string;
	address: string;
	decimals: number;
	symbol: string;
	icon: string;
	chain: string;
	createtime: string;
	hot: string;
	sort: string;
	chainId: number;
	customSymbol: any;
	customAddress: any;
	usd: string;
}

interface GetTokenListResponse {
	/**If `200`, you're all good */
	code: number;
	data: ChainTokenData[];
}

// ? GetQuoteResponse

interface InOutTokenData {
	address: string;
	decimals: number;
	symbol: string;
	name: string;
	usd: string;
	volume: number;
}

interface DexContribution {
	dexIndex: number;
	dexCode: string;
	/**convert to token count by dividing by `10 * outToken.decimals` */
	swapAmount: string;
}

interface SubRoutesDexesObject {
	dex: string;
	id: string;
	parts: number;
	/**If `100`, use this!!! */
	percentage: number;
	fee: number;
}

interface SubRoutesObject {
	from: string;
	to: string;
	parts: number;
	dexes: SubRoutesDexesObject[];
}

interface RoutesObject {
	parts: number;
	/**If `100`, use this!!! */
	percentage: number;
	subRoutes: SubRoutesObject[];
}

interface GetQuoteResponse {
	/**If `200`, you're all good */
	code: number;
	data: {
		inToken: InOutTokenData;
		outToken: InOutTokenData;
		/**convert to token count by dividing by `10 * inToken.decimals` */
		inAmount: string;
		/**convert to token count by dividing by `10 * outToken.decimals` */
		outAmount: string;
		/**in GWEI */
		estimatedGas: string;
		dexes: DexContribution[];
		path: {
			from: string;
			to: string;
			parts: number;
			routes: RoutesObject[];
		};
		save: number;
		price_impact: string;
	};
}

// ? GetSwapQuoteOpenOceanResponse

interface GetSwapQuoteOpenOceanResponse {
	/**In the outToken token, slippage excluded */
	outTokenValueActual: number;
	/**In the outToken token, accounted for slippage */
	outTokenValueWorst: number;
	/**in GWEI */
	gas: number;
	dexCode: string;
	dexAddress: string;
}

// ? GetChainTokenPriceObj

interface GetChainTokenPriceObj {
	chainId: number;
	nativeTokenAddress: string;
}

// ? GetSwapQuoteOpenOceanObj

interface GetSwapQuoteOpenOceanObj {
	inToken: string;
	outToken: string;
	amount: number;
	chainId: number;
}

// ? === === === === ===

interface OpenOceanTypes {
	GetTokenListResponse: GetTokenListResponse;
	GetQuoteResponse: GetQuoteResponse;
	GetSwapQuoteOpenOceanResponse: GetSwapQuoteOpenOceanResponse;
	GetChainTokenPriceObj: GetChainTokenPriceObj;
	GetSwapQuoteOpenOceanObj: GetSwapQuoteOpenOceanObj;
	SubRoutesObject: SubRoutesObject;
}

export type { OpenOceanTypes };
