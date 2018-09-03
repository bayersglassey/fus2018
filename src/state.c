
#include "includes.h"

#ifndef FUS_STATE_MAX_STEPS
    #define FUS_STATE_MAX_STEPS 100000
#endif

#ifndef FUS_STATE_MAX_FRAMES
    #define FUS_STATE_MAX_FRAMES 50
#endif



void fus_state_frame_cleanup(fus_state_frame_t *frame){
    fus_obj_cleanup(&frame->vars);
    fus_coderef_cleanup(&frame->coderef);
}

int fus_state_frame_init(fus_state_frame_t *frame, fus_code_t *code){
    fus_obj_init(&frame->vars);
    fus_coderef_init(&frame->coderef, code);
    frame->last_executed_opcode_i = 0;
    return 0;
}


void fus_state_cleanup(fus_state_t *state){
    fus_stack_cleanup(&state->stack);
    ARRAY_FREE_PTRS(fus_state_frame_t, state->frames,
        fus_state_frame_cleanup)
}

int fus_state_init(fus_state_t *state, fus_compiler_t *compiler){
    int err;
    state->steps = 0;
    state->max_steps = FUS_STATE_MAX_STEPS;
    state->max_frames = FUS_STATE_MAX_FRAMES;
    state->compiler = compiler;
    err = fus_stack_init(&state->stack);
    if(err)return err;
    ARRAY_INIT(state->frames)
    return 0;
}



int fus_state_push_frame(fus_state_t *state, fus_code_t *code){
    int err;
    ARRAY_PUSH_NEW(fus_state_frame_t*, state->frames, frame);
    err = fus_state_frame_init(frame, code);
    if(err)return err;
    return 0;
}

int fus_state_pop_frame(fus_state_t *state){
    int err;
    if(state->frames_len <= 0){
        ERR_INFO();
        fprintf(stderr, "No frame to pop!\n");
        return 2;
    }
    fus_state_frame_t *frame = NULL;
    ARRAY_POP(fus_state_frame_t*, state->frames, frame)
    fus_state_frame_cleanup(frame);
    return 0;
}

fus_state_frame_t *fus_state_get_cur_frame(fus_state_t *state){
    if(state->frames_len == 0)return NULL;
    return state->frames[state->frames_len - 1];
}

int fus_state_run(fus_state_t *state){
    int err;
    bool done = false;
    while(!done){
        err = fus_state_step(state, &done);
        if(err)return err;
    }
    return 0;
}


