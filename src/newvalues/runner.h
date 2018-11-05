#ifndef _FUS_RUNNER_H_
#define _FUS_RUNNER_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


struct fus_state {
    fus_vm_t *vm;
    fus_arr_t stack;
    fus_obj_t vars;
    fus_obj_t defs;
};


void fus_state_init(fus_state_t *state, fus_vm_t *vm);
void fus_state_cleanup(fus_state_t *state);
void fus_state_dump(fus_state_t *state, FILE *file, const char *fmt);

int fus_state_exec_lexer(fus_state_t *state, fus_lexer_t *lexer,
    bool dump_parser);
int fus_state_exec_data(fus_state_t *state, fus_arr_t *data);


#endif