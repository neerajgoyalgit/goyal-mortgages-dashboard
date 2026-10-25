
from pathlib import Path
from collections import defaultdict
from decimal import Decimal
from supabase import create_client

from rate_change_detector import detect_rate_changes


def load_config():
    config = {}

    for line in Path(".env.local").read_text().splitlines():
        line = line.strip()

        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        config[key.strip()] = value.strip().strip('"').strip("'")

    return config


def fetch_history(client):
    rows = []
    offset = 0
    page_size = 500

    while True:
        response = (
            client.table("mortgage_rate_history")
            .select(
                "lender,scenario_key,product_name,"
                "ltv_percent,rate_percent,product_fee_gbp,observed_at"
            )
            .order("observed_at")
            .range(offset, offset + page_size - 1)
            .execute()
        )

        batch = response.data or []
        rows.extend(batch)

        if len(batch) < page_size:
            break

        offset += page_size

    return rows


def main():
    config = load_config()

    client = create_client(
        config["VITE_SUPABASE_URL"],
        config["VITE_SUPABASE_PUBLISHABLE_KEY"],
    )

    try:
        history = fetch_history(client)
    except Exception as error:
        print("\nGOYAL MORTGAGES — LIVE RATE CHANGE REPORT")
        print("-" * 48)
        print("Historical rate data is not accessible with the current key.")
        print("Database permissions have not been changed.")
        print("No notifications were sent.")
        print(f"Error type: {type(error).__name__}")
        return    

    print("\nGOYAL MORTGAGES — LIVE RATE CHANGE REPORT")
    print("-" * 48)
    print(f"Historical observations visible: {len(history)}")

    grouped = defaultdict(list)

    for row in history:
        key = (
            row["lender"],
            row["scenario_key"],
            row["product_name"],
            str(Decimal(str(row["ltv_percent"]))),
        )
        grouped[key].append(row)

    confirmed_changes = []
    insufficient_history = 0

    for observations in grouped.values():
        observations.sort(key=lambda row: row["observed_at"])

        if len(observations) < 2:
            insufficient_history += 1
            continue

        for previous, current in zip(
            observations[:-1], observations[1:]
        ):
            result = detect_rate_changes([previous], [current])[0]

            if result["status"] in (
                "rate_changed",
                "fee_changed",
                "rate_and_fee_changed",
            ):
                confirmed_changes.append(result)

    print(f"Unique products: {len(grouped)}")
    print(f"Products without comparison history: {insufficient_history}")
    print(f"Confirmed changes: {len(confirmed_changes)}")

    for change in confirmed_changes:
        print(
            f"\n{change['lender']} — {change['product']} "
            f"({change['ltv']}% LTV)"
        )
        print(f"Change: {change['status']}")
        print(
            f"Rate: {change['old_rate']}% → "
            f"{change['new_rate']}%"
        )
        print(
            f"Fee: £{change['old_fee']} → "
            f"£{change['new_fee']}"
        )

    print("\nREAD-ONLY REPORT COMPLETE — NO EMAILS SENT")


if __name__ == "__main__":
    main()

