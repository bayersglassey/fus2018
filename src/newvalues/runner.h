#ifndef _FUS_RUNNER_H_
#define _FUS_RUNNER_H_


/* * * * * * * * * * * * * * * * * * * * * * * * * * *
 * This file expects to be included by "includes.h"  *
 * * * * * * * * * * * * * * * * * * * * * * * * * * */


typedef enum fus_runner_callframe_type {
    FUS_CALLFRAME_TYPE_MODULE,
    FUS_CALLFRAME_TYPE_DEF,
    FUS_CALLFRAME_TYPE_PAREN,
    FUS_CALLFRAME_TYPE_IF,
    FUS_CALLFRAME_TYPE_DO,
    FUS_CALLFRAME_TYPES
} fus_runner_callframe_type_t;

struct fus_state {
    fus_vm_t *vm;
    fus_arr_t stack;
    fus_obj_t vars;
    fus_obj_t defs;
};

struct fus_runner_callframe {
    fus_runner_t *runner;
    fus_runner_callframe_type_t type;
    fus_arr_t data;
    int i;
};

struct fus_runner {
    fus_state_t *state;
    fus_array_t callframes;

    fus_class_t class_callframe;
};


/*********
 * STATE *
 *********/

void fus_state_init(fus_state_t *state, fus_vm_t *vm);
void fus_state_cleanup(fus_state_t *state);
void fus_state_dump(fus_state_t *state, FILE *file, const char *fmt);

int fus_state_exec_lexer(fus_state_t *state, fus_lexer_t *lexer,
    bool dump_parser);
int fus_state_exec_data(fus_state_t *state, fus_arr_t *data);


/**********
 * RUNNER *
 **********/

void fus_runner_callframe_init(fus_runner_callframe_t *callframe,
    fus_runner_t *runner,
    fus_runner_callframe_type_t type,
    fus_arr_t *data);
void fus_runner_callframe_cleanup(fus_runner_callframe_t *callframe);
void fus_runner_init(fus_runner_t *runner, fus_state_t *state,
    fus_arr_t *data);
void fus_runner_cleanup(fus_runner_t *runner);
void fus_runner_dump(fus_runner_t *runner, FILE *file);

fus_runner_callframe_t *fus_runner_get_callframe(fus_runner_t *runner);
bool fus_runner_is_done(fus_runner_t *runner);
void fus_runner_push_callframe(fus_runner_t *runner,
    fus_runner_callframe_type_t type,
    fus_arr_t *data);
void fus_runner_pop_callframe(fus_runner_t *runner);
int fus_runner_step(fus_runner_t *runner);



/*******************
 * FUS_CLASS STUFF *
 *******************/

void fus_class_cleanup_runner_callframe(fus_class_t *class, void *ptr);


#endif