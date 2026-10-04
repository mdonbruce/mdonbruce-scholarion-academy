# Instructor guide: Inspect data quality

Objective: O2: Construct and explain a bounded prototype for a predictive service queue.

Timing: 10-minute setup, 20-minute implementation, 20-minute challenge, 15-minute critique, 5-minute wrap-up.

Emphasize: Flag it and send the record for review

Common mistake: Silently replace it with perfect confidence. Ask which assumption failed.

Worked interpretation: Missing values and duplicates change metric denominators. Separate schema checks from business rules; reject malformed records visibly rather than silently converting them to ordinary inputs.

Discussion: post one failure and critique one peer with evidence.

Do not treat a rules simulation as a live model or production service. Review the claim against reproduced outputs.