
from decimal import Decimal


def detect_rate_changes(previous_products, current_products):
    """
    Compare two mortgage product snapshots.

    Product identity:
      lender + scenario + product name + LTV

    Returns:
      - rate_changed
      - fee_changed
      - new_baseline
      - unchanged
    """

    def product_key(product):
        return (
            product["lender"],
            product["scenario_key"],
            product["product_name"],
            str(Decimal(str(product["ltv_percent"]))),
        )

    previous = {
        product_key(product): product
        for product in previous_products
    }

    results = []

    for current in current_products:
        key = product_key(current)
        old = previous.get(key)

        if old is None:
            status = "new_baseline"
        else:
            old_rate = Decimal(str(old["rate_percent"]))
            new_rate = Decimal(str(current["rate_percent"]))
            old_fee = Decimal(str(old["product_fee_gbp"]))
            new_fee = Decimal(str(current["product_fee_gbp"]))

            if old_rate != new_rate and old_fee != new_fee:
                status = "rate_and_fee_changed"
            elif old_rate != new_rate:
                status = "rate_changed"
            elif old_fee != new_fee:
                status = "fee_changed"
            else:
                status = "unchanged"

        results.append({
            "product": current["product_name"],
            "lender": current["lender"],
            "ltv": current["ltv_percent"],
            "status": status,
            "old_rate": old["rate_percent"] if old else None,
            "new_rate": current["rate_percent"],
            "old_fee": old["product_fee_gbp"] if old else None,
            "new_fee": current["product_fee_gbp"],
        })

    return results


if __name__ == "__main__":
    previous_products = [
        {
            "lender": "Nationwide",
            "scenario_key": "purchase_400000_30y_repayment",
            "product_name": "2 Year Fixed Rate",
            "ltv_percent": 75,
            "rate_percent": 5.23,
            "product_fee_gbp": 1499,
        }
    ]

    current_products = [
        {
            "lender": "Nationwide",
            "scenario_key": "purchase_400000_30y_repayment",
            "product_name": "2 Year Fixed Rate",
            "ltv_percent": 75,
            "rate_percent": 5.13,
            "product_fee_gbp": 1499,
        }
    ]

    changes = detect_rate_changes(previous_products, current_products)

    print("\nGOYAL MORTGAGES — RATE CHANGE DETECTOR")
    print("-" * 45)

    for change in changes:
        print(f"Lender: {change['lender']}")
        print(f"Product: {change['product']}")
        print(f"LTV: {change['ltv']}%")
        print(f"Status: {change['status']}")
        print(f"Previous rate: {change['old_rate']}%")
        print(f"Current rate: {change['new_rate']}%")
        print(f"Previous fee: £{change['old_fee']}")
        print(f"Current fee: £{change['new_fee']}")

