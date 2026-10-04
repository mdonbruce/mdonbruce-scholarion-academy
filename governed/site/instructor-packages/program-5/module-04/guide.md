# Instructor guide: Separate training and evaluation

Objective: O4: Demonstrate privacy minimization, human approval and recoverable failure.

Timing: 10-minute setup, 20-minute implementation, 20-minute challenge, 15-minute critique, 5-minute wrap-up.

Emphasize: Repeated tuning on held-out labels

Common mistake: Keeping test examples unseen during tuning. Ask which assumption failed.

Worked interpretation: Tuning on held-out labels creates optimistic estimates. Preserve a final test set and compare with a simple baseline. This offline exercise evaluates a rule, not a trained ML model.

Discussion: post one failure and critique one peer with evidence.

Do not treat a rules simulation as a live model or production service. Review the claim against reproduced outputs.