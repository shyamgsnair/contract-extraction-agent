# Accuracy report (claude-code engine)

| Field | arnet-isatori | lannett-sino | powin-stem | seracare-wyeth | trilogy-flex | Accuracy |
| --- | --- | --- | --- | --- | --- | --- |
| documentType | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| customerName | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| vendorName | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| effectiveDate | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| expirationDate | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| autoRenews | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| priceEscalation | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| paymentTermsDays | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| minimumCommitment | ✓ | ✓ | ✓ | ✗ | ✓ | 80% |
| poAcceptance | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |
| priceList | ✓ | ✓ | ✓ | ✓ | ✓ | 100% |

- **Overall accuracy:** 98% (54 of 55 scored fields; target 85%)
- **Lowest field:** minimumCommitment at 80% (target: none below 60%)
- **Quotes not verified and not flagged:** 0 (target 0)
- **Contracts flagged for review:** 0 of 5
- **Run time and cost:** 105s, $0.50 equivalent API cost (not billed)
- **Unjudged free-text fields:** 0

**Verdict: GO**

## Misses

- **seracare-wyeth**
  - minimumCommitment: expected "At least 80% of Wyeth's human serum albumin requirements", got null
