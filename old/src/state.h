#ifndef _FUS_STATE_H_
#define _FUS_STATE_H_


typedef struct fus_state_frame {
    fus_obj_t vars;
    fus_coderef_t coderef;
    int last_executed_opcode_i;
} fus_state_frame_t;

typedef struct fus_state {
    int steps;
    int max_steps;
    int max_frames;
    fus_compiler_t *compiler;
    fus_stack_t stack;
    ARRAY_DECL(fus_state_frame_t*, frames)
} fus_state_t;



void fus_state_frame_cleanup(fus_state_frame_t *frame);
int fus_state_frame_init(fus_state_frame_t *frame, fus_code_t *code);
void fus_state_cleanup(fus_state_t *state);
int fus_state_init(fus_state_t *state, fus_compiler_t *compiler);

int fus_state_push_frame(fus_state_t *state, fus_code_t *code);
int fus_state_pop_frame(fus_state_t *state);
fus_state_frame_t *fus_state_get_cur_frame(fus_state_t *state);
int fus_state_run(fus_state_t *state);
int fus_state_step(fus_state_t *state, bool *done_ptr);

#endif