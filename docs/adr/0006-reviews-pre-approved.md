---
status: accepted
---

# Reviews require Super Admin pre-approval, unlike listing edits

ADR 0005 lets Business Owner listing edits go live immediately with after-the-fact review. Reviews deliberately break from that pattern: a review is submitted by any signed-in visitor (there's no booking to verify they actually visited — see ADR 0001) and stays in a `pending` status, invisible on the public listing, until a Super Admin approves it.

The risk profile is different from an owner editing their own listing: reviews are open, low-trust, user-generated content with real potential for spam, fake/competitor-planted reviews, and defamatory content — the kind of thing you don't want live even briefly. A Business Owner can respond to an approved review (a reply field on the review row, not a separate entity) and can report a review to the Super Admin, but cannot approve or remove it themselves.

A User may post at most one review per Listing (enforced by a unique constraint); to change their opinion they edit their existing review rather than adding a new one.
