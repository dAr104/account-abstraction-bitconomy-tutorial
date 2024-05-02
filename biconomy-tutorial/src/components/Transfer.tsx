import { BiconomySmartAccountV2 } from "@biconomy/account";
import { Transaction } from "@biconomy/core-types";
import { useEffect, useState } from "react";
import { ethers } from "ethers";
import { USDC_CONTRACT_ADDRESS, ERC20ABI } from "@/constants";
import { IHybridPaymaster, PaymasterMode, SponsorUserOperationDto } from "@biconomy/paymaster";

export default function Transfer({ smartAccount }: { smartAccount: BiconomySmartAccountV2 }) {
    const [smartContractAddress, setSmartContractAddress] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [amount, setAmount] = useState(0);
    const [recipient, setRecipient] = useState("");

    async function getSmartContractAddress() {
        const smartContractAddress = await smartAccount.getAccountAddress();
        setSmartContractAddress(smartContractAddress);
    }

    // Get the address of the smart account when the component loads
    useEffect(() => {
        getSmartContractAddress();
    }, []);

    async function transfer() {
        try {
            // Initiate the loading state
            setIsLoading(true);

            // Create an Ethers Contract instance for USDC
            const provider = new ethers.providers.JsonRpcProvider(
                "https://sepolia.infura.io/v3/ec37bff7ab5849c9a90ecc2744a48059"
            );
            const tokenContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, ERC20ABI, provider);

            // Fetch the amount of decimals in this ERC20 Contract
            const decimals = await tokenContract.decimals();
            // Convert the user inputted amount to the proper denomination unit based on the token decimals
            const amountInLowestUnit = ethers.utils.parseUnits(amount.toString(), decimals);

            console.log("amountInLowestUnit: ", amountInLowestUnit.toString());

            // Create the calldata for our UserOperation
            const populatedTransferTxn = await tokenContract.populateTransaction.transfer(
                recipient,
                amountInLowestUnit
            );
            const calldata = populatedTransferTxn.data;

            const transaction = {
                to: USDC_CONTRACT_ADDRESS,
                value: 0,
                data: calldata,
            };

            //console.log(`transaction: ${JSON.stringify(transaction, null, 2)}`);

            // Build the UserOperation
            const userOp = await smartAccount.buildUserOp([transaction]);

            //console.log(`sono qui`);

            // Get the paymaster fee quote from Biconomy
            const biconomyPaymaster = smartAccount.paymaster as IHybridPaymaster<SponsorUserOperationDto>;
            const feeQuoteResponse = await biconomyPaymaster.getPaymasterFeeQuotesOrData(userOp, {
                mode: PaymasterMode.SPONSORED,
                tokenList: [],
                preferredToken: USDC_CONTRACT_ADDRESS,
            });
            console.log(`feeQuoteResponse: ${JSON.stringify(feeQuoteResponse, null, 2)}`);
            const feeQuote = feeQuoteResponse.feeQuotes;
            if (!feeQuote) throw new Error("Could not fetch fee quote in USDC");

            const spender = feeQuoteResponse.tokenPaymasterAddress || "0x0";
            const selectedFeeQuote = feeQuote[0];

            console.log(`feeQuote: ${JSON.stringify(feeQuote, null, 2)}`);
            console.log(`spender: ${spender}`);
            console.log(`selectedFeeQuote: ${JSON.stringify(selectedFeeQuote, null, 2)}`);
            console.log(`userOp: ${JSON.stringify(userOp, null, 2)}`);

            // Build the paymaster userOp
            let finalUserOp = await smartAccount.buildTokenPaymasterUserOp(userOp, {
                feeQuote: selectedFeeQuote,
                spender: spender,
                maxApproval: false,
            });

            // Get the calldata for the paymaster
            const paymasterServiceData = {
                mode: PaymasterMode.SPONSORED,
                feeTokenAddress: USDC_CONTRACT_ADDRESS,
                calculateGasLimits: true,
            };
            const paymasterAndDataResponse = await biconomyPaymaster.getPaymasterAndData(
                finalUserOp,
                paymasterServiceData
            );
            finalUserOp.paymasterAndData = paymasterAndDataResponse.paymasterAndData;

            if (
                paymasterAndDataResponse.callGasLimit &&
                paymasterAndDataResponse.verificationGasLimit &&
                paymasterAndDataResponse.preVerificationGas
            ) {
                // Returned gas limits must be replaced in your op as you update paymasterAndData.
                // Because these are the limits paymaster service signed on to generate paymasterAndData

                finalUserOp.callGasLimit = paymasterAndDataResponse.callGasLimit;
                finalUserOp.verificationGasLimit = paymasterAndDataResponse.verificationGasLimit;
                finalUserOp.preVerificationGas = paymasterAndDataResponse.preVerificationGas;
            }

            console.log(`finalUserOP: ${JSON.stringify(finalUserOp, null, 2)}`);
            // Send the UserOperation
            const userOpResponse = await smartAccount.sendUserOp(finalUserOp);
            const receipt = await userOpResponse.wait();

            console.log(`Transaction receipt: ${JSON.stringify(receipt, null, 2)}`);
            window.alert("Transaction successful!");
        } catch (error) {
            console.log(error);
        }

        setIsLoading(false);
    }
    return (
        <div>
            <p className="text-sm"> Your smart account address is : {smartContractAddress}</p>
            {isLoading ? (
                <div>Loading...</div>
            ) : (
                <div>
                    <p>Transfer tokens from your account to another :</p>
                    <div className="mt-5  flex w-auto flex-col gap-2">
                        <input
                            className="rounded-xl border-2 p-1 text-gray-500"
                            type="text"
                            placeholder="Enter address"
                            onChange={(e) => setRecipient(e.target.value)}
                        />
                        <input
                            className="rounded-xl border-2 p-1 text-gray-500"
                            type="number"
                            placeholder="Enter amount"
                            onChange={(e) => setAmount(Number(e.target.value))}
                        />
                        <button
                            className="w-32 rounded-lg bg-gradient-to-r from-green-400 to-blue-500 px-4 py-2 font-medium transition-all hover:from-green-500 hover:to-blue-600"
                            onClick={transfer}
                        >
                            Transfer
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
