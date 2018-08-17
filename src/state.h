#ifndef _FUS_STATE_H_
#define _FUS_STATE_H_


typedef struct fus_state_frame {
    fus_obj_t vars;
    fus_coderef_t coderef;
} fus_state_frame_t;

typedef struct fus_state {
    fus_symtable_t *symtable;
    fus_stack_t stack;
    ARRAY_DECL(fus_state_frame_t, frames)
} fus_state_t;



void fus_state_frame_cleanup(fus_state_frame_t *frame);
int fus_state_frame_init(fus_state_frame_t *frame, fus_code_t *code);
void fus_state_cleanup(fus_state_t *state);
int fus_state_init(fus_state_t *state, fus_symtable_t *symtable);

#endif