import hre from "hardhat";
import { FlashLoanArb__factory } from "../typechain-types";

async function main() {
	const [deployer] = await hre.console.log(
		"Deploying contract with account:",
		deployer.address
	);

	const AAVE_POOL = "0x..."; // Replace with actual Aave Pool address on Polygon
	const EXECUTOR = deployer.address; // Your bot or executor address

	const FlashLoanArbFactory = (await hre.ethers.getContractFactory(
		"FlashLoanArb"
	)) as FlashLoanArb__factory;
	const contract = await FlashLoanArbFactory.deploy(AAVE_POOL, EXECUTOR);
	await contract.deployed();

	console.log("FlashLoanArb deployed at:", contract.address);
}

main().catch((error) => {
	console.error("Deployment failed:", error);
	process.exit(1);
});
