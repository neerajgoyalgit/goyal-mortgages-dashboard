"""Load an HM Land Registry Price Paid CSV file into E16 staging CSV.

Usage: python import_e16.py path/to/pp-monthly-update.csv
Produces e16-sales-import.csv locally; does not write to Supabase.
The source file must be downloaded from the official Price Paid Data downloads page.
"""
import csv
import re
import sys
from pathlib import Path

FIELDS = ["transaction_id","price_gbp","transfer_date","postcode","property_type",
          "old_new","duration","paon","saon","street","locality","town",
          "district","county","record_status"]

def main():
    if len(sys.argv)!=2:
        raise SystemExit("Usage: python import_e16.py <land-registry-price-paid.csv>")
    source=Path(sys.argv[1])
    count=0
    with source.open(newline="",encoding="utf-8-sig") as incoming, Path("e16-sales-import.csv").open("w",newline="",encoding="utf-8") as outgoing:
        writer=csv.DictWriter(outgoing,fieldnames=FIELDS)
        writer.writeheader()
        for row in csv.reader(incoming):
            if len(row)!=16:
                continue
            postcode=re.sub(r"\s+"," ",row[3].strip().upper())
            if not re.match(r"^E16\s",postcode):
                continue
            postcode=re.sub(r"^E16\s*","E16 ",postcode)
            record=dict(zip(FIELDS,[row[0].strip("{}"),row[1],row[2][:10],postcode,
                row[4],row[5],row[6],row[7],row[8],row[9],row[10],
                row[11],row[12],row[13],row[15]]))
            writer.writerow(record)
            count+=1
    print(f"Wrote {count} E16 transactions to e16-sales-import.csv")
    print("Do not publish raw addresses or upload this CSV to a public Git repository.")
if __name__=="__main__":
    main()
