/*-
 *
 * Hedera Mirror Node Explorer
 *
 * Copyright (C) 2021 - 2023 Hedera Hashgraph, LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

import {compareTransferByAccount, NetworkNode, Transaction, Transfer} from "@/schemas/HederaSchemas";
import {computeNetAmount} from "@/utils/TransactionTools";
import {makeOperatorDescription} from "@/schemas/HederaUtils";

export class HbarTransferLayout {

    public readonly transaction: Transaction|undefined
    public readonly nodes: NetworkNode[]
    public readonly netAmount: number
    public readonly sources = Array<HbarTransferRow>()
    public readonly destinations = Array<HbarTransferRow>()
    public readonly rowCount: number

    //
    // Public
    //

    public constructor(transaction: Transaction|undefined, nodes: NetworkNode[], full = true) {

        this.transaction = transaction
        this.nodes = nodes
        this.netAmount = transaction ? computeNetAmount(transaction) : 0

        if (this.transaction?.transfers) {
            const negativeTransfers = new Array<Transfer>()
            const positiveTransfers = new Array<Transfer>()
            for (const t of this.transaction.transfers) {
                if (t.amount < 0) {
                    negativeTransfers.push(t)
                } else {
                    positiveTransfers.push(t)
                }
            }
            negativeTransfers.sort(compareTransferByAccount)
            positiveTransfers.sort(compareTransferByAccount)

            for (const t of negativeTransfers) {
                const payload = t.account === null || makeOperatorDescription(t.account, this.nodes) === null
                this.sources.push(new HbarTransferRow(t, null, payload))
            }
            for (const t of positiveTransfers) {
                const operator = t.account !== null ? makeOperatorDescription(t.account, this.nodes) : null
                const payload = t.account === null || operator === null
                this.destinations.push(new HbarTransferRow(t, operator ?? "Transfer", payload))
            }
        }

        // Makes sure net amount is distributed across payload transfers
        let remaining = this.netAmount
        // First we remove amount from payload transfers
        for (const r of this.destinations) {
            if (r.payload) {
                remaining -= r.transfer.amount
            }
        }
        // If remaining > 0 then we distribute the amount across non payload transfers
        if (remaining > 0) {
            for (const r of this.destinations.slice()) {
                if (!r.payload) {
                    const payloadAmount = Math.min(r.transfer.amount, remaining)
                    const feeAmount = r.transfer.amount - payloadAmount
                    // Removes existing transfer
                    const i = this.destinations.indexOf(r)
                    // assert(i != -1)
                    const replacedTransfer = this.destinations[i]
                    this.destinations.splice(i, 1)
                    // Inserts two new transfers
                    const payloadTransfer = { ... r.transfer } ; payloadTransfer.amount = payloadAmount
                    const payloadRow = new HbarTransferRow(payloadTransfer, replacedTransfer.description, true)
                    this.destinations.splice(i, 0, payloadRow)
                    if (feeAmount > 0) {
                        const feeTransfer = { ... r.transfer } ; feeTransfer.amount = feeAmount
                        const feeRow = new HbarTransferRow(feeTransfer, replacedTransfer.description, false)
                        this.destinations.splice(i+1, 0, feeRow)
                    }
                    remaining -= payloadAmount
                    if (remaining <= 0) break
                }
            }
        }


        if (!full) {
            // We remove "fee" rows (ie rows with payload == false)
            const sRemovalCount = HbarTransferLayout.removeFeeRows(this.sources)
            const dRemovalCount = HbarTransferLayout.removeFeeRows(this.destinations)
            if ((sRemovalCount >= 1 && this.sources.length == 0) ||
                (dRemovalCount >= 1 && this.destinations.length == 0)) {
                // Sources or destinations or both are all "fees"
                this.sources.splice(0)
                this.destinations.splice(0)
            }
        }

        this.rowCount = Math.max(this.sources.length, this.destinations.length)
    }


    //
    // Private
    //

    private static removeFeeRows(rows: HbarTransferRow[]): number {
        let result = 0
        let i = 0
        while (i < rows.length) {
            if (rows[i].payload) {
                i += 1
            } else {
                rows.splice(i, 1)
                result += 1
            }
        }
        return result
    }
}

export class HbarTransferRow {
    public readonly transfer: Transfer
    public readonly description: string|null
    public readonly payload: boolean

    constructor(transfer: Transfer, description: string|null, payload: boolean) {
        this.transfer = transfer
        this.description = description
        this.payload = payload

    }
}