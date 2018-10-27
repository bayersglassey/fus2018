#ifndef _FUS_RUNNER_H_
#define _FUS_RUNNER_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


struct fus_state {
    fus_vm_t *vm;
    fus_arr_t stack;
    //fus_obj_t vars;
};


void fus_state_init(fus_state_t *state, fus_vm_t *vm);
void fus_state_cleanup(fus_state_t *state);

int fus_run_text(fus_t *fus, const char *filename, const char *text);


#endif